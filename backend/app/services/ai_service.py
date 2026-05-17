import logging
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.product import Product
from app.models.user import User
from app.services.embedding_service import get_embedding
from app.services.llm_service import create_chat_completion
from app.services.milvus_service import search_similar

logger = logging.getLogger(__name__)


async def _retrieve_relevant_products(
    db: AsyncSession,
    business_id,
    question: str,
    top_k: int = 5,
) -> list[Product]:
    """RAG retrieval: find most similar products using Milvus cosine search."""
    question_embedding = await get_embedding(question)

    # Search Milvus for nearest product IDs
    product_ids = search_similar(str(business_id), question_embedding, top_k)

    if not product_ids:
        return []

    # Fetch full product rows from PostgreSQL
    result = await db.execute(select(Product).where(Product.id.in_(product_ids)))
    products_by_id = {str(product.id): product for product in result.scalars().all()}
    return [products_by_id[product_id] for product_id in product_ids if product_id in products_by_id]


def _format_product_for_ai(product: Product, index: int | None = None) -> str:
    prefix = f"{index}. " if index is not None else ""
    line = f"{prefix}{product.name}"
    if product.sku:
        line += f" - SKU: {product.sku}"
    if product.category:
        line += f" - Danh mục: {product.category}"
    if product.description:
        line += f" - {product.description}"
    if product.price is not None:
        line += f" - Giá: {product.price:,.0f} VND"
    line += f" - {'Còn hàng' if product.status == 'available' else 'Hết hàng'}"
    if product.stock_quantity is not None:
        line += f" - Tồn kho: {product.stock_quantity}"
    else:
        line += " - Tồn kho: không có thông tin số lượng"
    if product.extra_info:
        line += f" - Thông tin thêm: {json.dumps(product.extra_info, ensure_ascii=False, sort_keys=True)}"
    return line


async def _retrieve_products_without_vector_search(
    db: AsyncSession,
    business_id,
    limit: int = 10,
) -> list[Product]:
    """Fallback product context when Milvus is unavailable or unhealthy."""
    result = await db.execute(
        select(Product)
        .where(Product.business_id == business_id)
        .order_by(Product.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def _get_chat_history(db: AsyncSession, conversation_id, limit: int = 10) -> list[Message]:
    """Get last N messages for context."""
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return list(reversed(messages))  # oldest first


async def _get_business_info(db: AsyncSession, business_id) -> User | None:
    result = await db.execute(select(User).where(User.id == business_id))
    return result.scalar_one_or_none()


def _format_business_context_for_customer_ai(business: User | None) -> str:
    if not business:
        return ""

    rows = [
        ("Mô tả cửa hàng", business.business_description),
        ("Địa chỉ", business.store_address),
        ("Giờ mở cửa", business.opening_hours),
        ("Chính sách vận chuyển", business.shipping_policy),
        ("Chính sách bảo hành/đổi trả", business.warranty_policy),
        ("Phương thức thanh toán", business.payment_methods),
        ("Hotline", business.hotline or business.phone),
    ]
    lines = [f"- {label}: {value}" for label, value in rows if value]
    return "\n".join(lines)


async def generate_ai_response(
    db: AsyncSession,
    conversation: Conversation,
    user_message: str,
) -> str | None:
    """Generate AI response using RAG + Groq LLM."""
    try:
        # 1. Get business info
        business = await _get_business_info(db, conversation.business_id)
        business_name = business.business_name or "Cửa hàng" if business else "Cửa hàng"
        business_context = _format_business_context_for_customer_ai(business)

        # 2. Retrieve relevant products (RAG). If Milvus is temporarily
        # unavailable, keep the AI reply working without product context.
        try:
            products = await _retrieve_relevant_products(db, conversation.business_id, user_message)
        except Exception as retrieval_error:
            logger.warning(
                "Product retrieval skipped for conversation %s: %s",
                conversation.id,
                retrieval_error,
                exc_info=True,
            )
            products = await _retrieve_products_without_vector_search(db, conversation.business_id)

        product_context = ""
        if products:
            product_lines = [_format_product_for_ai(p, i) for i, p in enumerate(products, 1)]
            product_context = "\n".join(product_lines)

        # 3. Get chat history
        history = await _get_chat_history(db, conversation.id)

        # 4. Build messages for LLM
        system_prompt = f"""Bạn là trợ lý bán hàng AI của "{business_name}".
{business_context}

Nhiệm vụ:
- Trả lời câu hỏi khách hàng về sản phẩm một cách thân thiện, chính xác.
- Nếu có thông tin sản phẩm liên quan bên dưới, hãy sử dụng để trả lời.
- Nếu không tìm thấy sản phẩm phù hợp, hãy trả lời lịch sự rằng bạn không có thông tin và đề nghị khách liên hệ trực tiếp.
- Trả lời ngắn gọn, tự nhiên, bằng tiếng Việt.
- KHÔNG bịa thông tin sản phẩm mà không có trong dữ liệu.

"""
        if product_context:
            system_prompt += f"=== THÔNG TIN SẢN PHẨM LIÊN QUAN ===\n{product_context}"
        else:
            system_prompt += "Hiện không có sản phẩm nào trong hệ thống."

        messages = [{"role": "system", "content": system_prompt}]

        # Add chat history
        for msg in history:
            if msg.sender_type == "contact":
                messages.append({"role": "user", "content": msg.content})
            elif msg.sender_type in ("business", "ai"):
                messages.append({"role": "assistant", "content": msg.content})

        # Current user message (if not already in history)
        if not history or history[-1].content != user_message:
            messages.append({"role": "user", "content": user_message})

        # 5. Call selected LLM provider
        chat_completion = await create_chat_completion(
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
        )

        ai_text = chat_completion.choices[0].message.content
        logger.info(f"AI response generated: {ai_text[:100]}...")
        return ai_text

    except Exception as e:
        logger.error(f"Error generating AI response: {e}", exc_info=True)
        return None
