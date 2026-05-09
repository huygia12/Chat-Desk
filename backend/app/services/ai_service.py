import logging
from groq import AsyncGroq
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import get_settings
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.product import Product
from app.models.user import User
from app.services.embedding_service import get_embedding
from app.services.milvus_service import search_similar

logger = logging.getLogger(__name__)
settings = get_settings()

client = AsyncGroq(api_key=settings.GROQ_API_KEY)


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
    result = await db.execute(
        select(Product).where(Product.id.in_(product_ids))
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
        business_desc = business.business_description or "" if business else ""

        # 2. Retrieve relevant products (RAG)
        products = await _retrieve_relevant_products(db, conversation.business_id, user_message)

        product_context = ""
        if products:
            product_lines = []
            for i, p in enumerate(products, 1):
                line = f"{i}. {p.name}"
                if p.description:
                    line += f" - {p.description}"
                if p.price is not None:
                    line += f" - Giá: {p.price:,.0f} VND"
                line += f" - {'Còn hàng' if p.status == 'available' else 'Hết hàng'}"
                if p.extra_info:
                    line += f" - Thông tin thêm: {p.extra_info}"
                product_lines.append(line)
            product_context = "\n".join(product_lines)

        # 3. Get chat history
        history = await _get_chat_history(db, conversation.id)

        # 4. Build messages for LLM
        system_prompt = f"""Bạn là trợ lý bán hàng AI của "{business_name}".
{f"Mô tả cửa hàng: {business_desc}" if business_desc else ""}

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

        # 5. Call Groq LLM
        chat_completion = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
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
