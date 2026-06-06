import asyncio
import logging
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import get_settings
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.product import Product
from app.models.user import User
from app.services.embedding_service import get_embedding
from app.services.llm_service import create_chat_completion
from app.services.milvus_service import search_similar_with_scores
from app.utils.logging import pretty_log

logger = logging.getLogger(__name__)


ProductHit = tuple[Product, float]


async def _retrieve_relevant_products(
    db: AsyncSession,
    business_id,
    question: str,
    top_k: int = 5,
) -> list[Product]:
    """RAG retrieval: find most similar products using Milvus cosine search."""
    product_hits = await _retrieve_relevant_products_with_scores(db, business_id, question, top_k)
    return [product for product, _score in product_hits]


async def _search_relevant_product_refs(
    business_id,
    question: str,
    top_k: int = 5,
) -> list[dict[str, str | float]]:
    """Run embedding + Milvus search without touching the SQL session."""
    question_embedding = await get_embedding(question)
    return search_similar_with_scores(str(business_id), question_embedding, top_k)


async def _fetch_products_for_refs(
    db: AsyncSession,
    product_refs: list[dict[str, str | float]],
) -> list[ProductHit]:
    product_ids = [str(item["id"]) for item in product_refs if item.get("id")]
    if not product_ids:
        return []

    result = await db.execute(select(Product).where(Product.id.in_(product_ids)))
    products_by_id = {str(product.id): product for product in result.scalars().all()}
    scores_by_id = {str(item["id"]): float(item.get("score", 0.0)) for item in product_refs}
    return [
        (products_by_id[product_id], scores_by_id.get(product_id, 0.0))
        for product_id in product_ids
        if product_id in products_by_id
    ]


async def _retrieve_relevant_products_with_scores(
    db: AsyncSession,
    business_id,
    question: str,
    top_k: int = 5,
) -> list[ProductHit]:
    """RAG retrieval with scores, preserving Milvus ranking."""
    product_refs = await _search_relevant_product_refs(business_id, question, top_k)
    return await _fetch_products_for_refs(db, product_refs)


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


def _score_summary(product_refs: list[dict[str, str | float]]) -> str:
    scores = [float(item.get("score", 0.0)) for item in product_refs[:3]]
    return ", ".join(f"{score:.3f}" for score in scores) if scores else "none"


def _is_current_search_confident(user_message: str, product_refs: list[dict[str, str | float]]) -> bool:
    settings = get_settings()
    if not product_refs:
        return False

    top_score = float(product_refs[0].get("score", 0.0))
    second_score = float(product_refs[1].get("score", 0.0)) if len(product_refs) > 1 else 0.0
    score_margin = top_score - second_score
    useful_result_count = sum(
        1 for item in product_refs if float(item.get("score", 0.0)) >= settings.AI_RETRIEVAL_MIN_SCORE
    )
    return (
        top_score >= settings.AI_RETRIEVAL_HIGH_CONFIDENCE_THRESHOLD
        and (score_margin >= settings.AI_RETRIEVAL_SCORE_MARGIN or useful_result_count >= 2)
        and len(user_message.strip()) >= settings.AI_RETRIEVAL_MIN_MESSAGE_LENGTH
    )


def _filter_product_hits(product_hits: list[ProductHit]) -> list[ProductHit]:
    min_score = get_settings().AI_RETRIEVAL_MIN_SCORE
    return [(product, score) for product, score in product_hits if score >= min_score]


def _format_history_for_rewrite(history: list[Message], user_message: str, limit: int = 8) -> str:
    context_history = history
    if context_history and context_history[-1].sender_type == "contact" and context_history[-1].content == user_message:
        context_history = context_history[:-1]

    role_names = {
        "contact": "Customer",
        "business": "Staff",
        "ai": "Assistant",
    }
    lines = []
    for message in context_history[-limit:]:
        role = role_names.get(message.sender_type, message.sender_type)
        lines.append(f"{role}: {message.content}")
    return "\n".join(lines) if lines else "(no previous conversation)"


def _extract_json_object(text: str) -> dict:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end >= start:
        cleaned = cleaned[start:end + 1]
    return json.loads(cleaned)


async def _rewrite_product_query(user_message: str, history: list[Message]) -> dict | None:
    settings = get_settings()
    if not settings.AI_REWRITE_ENABLED:
        return None

    rewrite_messages = [
        {
            "role": "system",
            "content": (
                "You rewrite customer chat messages into standalone product search queries for a RAG system. "
                "Use the recent conversation only when the latest message depends on context. "
                "If the latest message starts a new topic, preserve the latest message intent. "
                "Do not invent product names, variants, prices, stock, or attributes that are not present in the latest message or history. "
                "Return only JSON with keys: standalone_query, uses_context, confidence."
            ),
        },
        {
            "role": "user",
            "content": (
                "Recent conversation:\n"
                f"{_format_history_for_rewrite(history, user_message)}\n\n"
                f"Latest customer message:\n{user_message}\n\n"
                "Return JSON only."
            ),
        },
    ]

    try:
        completion = await asyncio.wait_for(
            create_chat_completion(
                messages=rewrite_messages,
                temperature=0.0,
                max_tokens=180,
            ),
            timeout=settings.AI_REWRITE_TIMEOUT_SECONDS,
        )
        content = completion.choices[0].message.content or ""
        payload = _extract_json_object(content)
        standalone_query = str(payload.get("standalone_query", "")).strip()
        confidence = float(payload.get("confidence", 0.0))
        if not standalone_query:
            return None
        return {
            "standalone_query": standalone_query[:1000],
            "uses_context": bool(payload.get("uses_context")),
            "confidence": max(0.0, min(confidence, 1.0)),
        }
    except Exception as exc:
        logger.warning("Customer AI query rewrite failed: %s", exc, exc_info=True)
        return None


async def _generate_ai_response_legacy(
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


async def generate_ai_response(
    db: AsyncSession,
    conversation: Conversation,
    user_message: str,
) -> str | None:
    """Generate a customer-facing AI response with selective query rewrite."""
    try:
        # Run history lookup in parallel with embedding + Milvus search. The
        # vector search path does not use the SQL session, so this avoids
        # concurrent DB operations on the same AsyncSession.
        history_task = asyncio.create_task(_get_chat_history(db, conversation.id))
        current_search_task = asyncio.create_task(
            _search_relevant_product_refs(conversation.business_id, user_message)
        )

        history_result, current_search_result = await asyncio.gather(
            history_task,
            current_search_task,
            return_exceptions=True,
        )

        if isinstance(history_result, Exception):
            logger.warning(
                "Customer AI history lookup failed for conversation %s: %s",
                conversation.id,
                history_result,
                exc_info=True,
            )
            history = []
        else:
            history = history_result

        product_hits: list[ProductHit] = []
        retrieval_query = user_message
        retrieval_mode = "none"
        retrieval_error = None

        if isinstance(current_search_result, Exception):
            retrieval_error = current_search_result
            logger.warning(
                "Customer AI current product search failed for conversation %s: %s",
                conversation.id,
                retrieval_error,
                exc_info=True,
            )
        elif _is_current_search_confident(user_message, current_search_result):
            retrieval_mode = "current"
            product_hits = await _fetch_products_for_refs(db, current_search_result)
            logger.info(
                "Customer AI current product search accepted:\n%s",
                pretty_log({
                    "conversation_id": conversation.id,
                    "scores": _score_summary(current_search_result),
                    "top_hits": current_search_result[:5],
                }),
            )
        else:
            logger.info(
                "Customer AI current product search not confident; using rewrite:\n%s",
                pretty_log({
                    "conversation_id": conversation.id,
                    "scores": _score_summary(current_search_result),
                    "top_hits": current_search_result[:5],
                }),
            )
            rewrite = await _rewrite_product_query(user_message, history)
            if rewrite and rewrite["confidence"] >= get_settings().AI_REWRITE_CONFIDENCE_THRESHOLD:
                retrieval_mode = "rewrite"
                retrieval_query = rewrite["standalone_query"]
                logger.info(
                    "Customer AI using rewritten product query:\n%s",
                    pretty_log({
                        "conversation_id": conversation.id,
                        "confidence": rewrite["confidence"],
                        "uses_context": rewrite["uses_context"],
                        "query": retrieval_query,
                    }),
                )
                try:
                    rewritten_refs = await _search_relevant_product_refs(
                        conversation.business_id,
                        retrieval_query,
                    )
                    product_hits = await _fetch_products_for_refs(db, rewritten_refs)
                    logger.info(
                        "Customer AI rewritten product search completed:\n%s",
                        pretty_log({
                            "conversation_id": conversation.id,
                            "scores": _score_summary(rewritten_refs),
                            "top_hits": rewritten_refs[:5],
                        }),
                    )
                except Exception as rewritten_error:
                    retrieval_error = rewritten_error
                    logger.warning(
                        "Customer AI rewritten product search failed for conversation %s: %s",
                        conversation.id,
                        rewritten_error,
                        exc_info=True,
                    )
            else:
                logger.info(
                    "Customer AI rewrite unavailable or low confidence for conversation %s; no product search fallback used",
                    conversation.id,
                )

        product_hits = _filter_product_hits(product_hits)
        if not product_hits:
            if retrieval_error:
                logger.info(
                    "Customer AI has no product context for conversation %s because product search failed",
                    conversation.id,
                )
            else:
                logger.info(
                    "Customer AI has no product context for conversation %s after %s retrieval",
                    conversation.id,
                    retrieval_mode,
                )

        product_context = ""
        if product_hits:
            product_lines = [
                _format_product_for_ai(product, i)
                for i, (product, _score) in enumerate(product_hits, 1)
            ]
            product_context = "\n".join(product_lines)

        business = await _get_business_info(db, conversation.business_id)
        business_name = business.business_name or "Cua hang" if business else "Cua hang"
        business_context = _format_business_context_for_customer_ai(business)

        system_prompt = f"""You are the customer-facing sales AI assistant for "{business_name}".
{business_context}

Rules:
- Answer customer product questions in Vietnamese unless the customer clearly uses another language.
- Use the product context below when it is relevant to the customer's latest message.
- If the product context is empty or product search failed, politely say in Vietnamese that you cannot find suitable product data in the system.
- If the customer is asking a follow-up question, use conversation history to understand the reference, but only use product facts from the product context.
- Do not invent product names, variants, prices, stock, specifications, or policies that are not in the provided data.
- Keep the answer concise, natural, and helpful.

=== PRODUCT SEARCH QUERY USED ===
{retrieval_query}

"""
        if product_context:
            system_prompt += f"=== PRODUCT CONTEXT ===\n{product_context}"
        else:
            system_prompt += "=== PRODUCT CONTEXT ===\nNo suitable product data was found for this question."

        messages = [{"role": "system", "content": system_prompt}]

        for msg in history:
            if msg.sender_type == "contact":
                messages.append({"role": "user", "content": msg.content})
            elif msg.sender_type in ("business", "ai"):
                messages.append({"role": "assistant", "content": msg.content})

        if not history or history[-1].content != user_message:
            messages.append({"role": "user", "content": user_message})

        chat_completion = await create_chat_completion(
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
        )

        ai_text = chat_completion.choices[0].message.content
        logger.info("AI response generated:\n%s", pretty_log({
            "conversation_id": conversation.id,
            "preview": ai_text[:200],
        }))
        return ai_text

    except Exception as e:
        logger.error("Error generating AI response: %s", e, exc_info=True)
        return None
