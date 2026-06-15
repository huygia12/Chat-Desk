import asyncio
import logging
import json
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import get_settings
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.product import Product
from app.models.user import User
from app.services.embedding_service import get_embedding
from app.services.llm_service import create_chat_completion
from app.services.milvus_service import search_similar_with_scores
from app.services.ai_scope_service import CUSTOMER_OUT_OF_SCOPE_REPLY, classify_ai_scope
from app.utils.logging import pretty_log

logger = logging.getLogger(__name__)


ProductHit = tuple[Product, float]
ORDER_READY_HANDOFF_TEXT = (
    "Tôi đã xác nhận yêu cầu đặt hàng của bạn và đã chuyển hội thoại sang cho nhân viên CSKH, vui lòng đợi"
)
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)")
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", flags=re.IGNORECASE)
CONTACT_METHOD_MISSING_FIELDS = {
    "phone",
    "email",
    "phone_or_email",
    "contact_method",
}
ADDRESS_MISSING_FIELDS = {
    "address",
    "delivery_address",
    "delivery_or_pickup_details",
    "fulfillment",
}
ADDRESS_DETECTED_FIELD_KEYS = {
    "address",
    "delivery_address",
    "shipping_address",
}


def _empty_order_detection() -> dict:
    return {
        "is_order_intent": False,
        "is_order_ready": False,
        "missing_fields": [],
        "detected_fields": {},
        "reply": "",
    }


def _response_result(text: str | None, scope: dict | None = None) -> dict:
    scope = scope or {}
    order_detection = dict(scope.get("order") or _empty_order_detection())
    order_detection.setdefault("is_order_intent", False)
    order_detection.setdefault("is_order_ready", False)
    order_detection.setdefault("missing_fields", [])
    order_detection.setdefault("detected_fields", {})
    order_detection.setdefault("reply", "")
    order_detection["confidence"] = scope.get("confidence", order_detection.get("confidence", 0.0))
    order_detection["reason"] = scope.get("reason", order_detection.get("reason", ""))
    return {
        "text": text,
        "scope": scope,
        "order_detection": order_detection,
    }


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


def _format_contact_context_for_customer_ai(contact: Contact | None) -> str:
    if not contact:
        return ""

    rows = [
        ("display_name", contact.display_name),
    ]
    return "\n".join(f"- {label}: {value}" for label, value in rows if value)


def _recent_customer_text(user_message: str, history: list[Message]) -> str:
    return "\n".join(
        [
            *(message.content or "" for message in history[-12:] if message.sender_type == "contact"),
            user_message or "",
        ]
    )


def _extract_phone_from_text(text: str) -> str | None:
    match = PHONE_PATTERN.search(text or "")
    if not match:
        return None
    return re.sub(r"\D", "", match.group(0))


def _extract_email_from_text(text: str) -> str | None:
    match = EMAIL_PATTERN.search(text or "")
    return match.group(0).strip().lower() if match else None


def _build_deterministic_order_facts(
    *,
    contact: Contact | None,
    user_message: str,
    history: list[Message],
) -> dict:
    customer_text = _recent_customer_text(user_message, history)
    phone = (contact.visitor_phone or "").strip() if contact and contact.visitor_phone else ""
    email = (contact.visitor_email or "").strip().lower() if contact and contact.visitor_email else ""
    address = (contact.visitor_address or "").strip() if contact and contact.visitor_address else ""

    if not phone:
        phone = _extract_phone_from_text(customer_text) or ""
    if not email:
        email = _extract_email_from_text(customer_text) or ""

    return {
        "phone": phone,
        "email": email,
        "delivery_address": address,
        "has_contact_method": bool(phone or email),
        "has_delivery_address": bool(address),
    }


def _format_order_facts_for_classifier(facts: dict) -> str:
    contact_status = "known" if facts.get("has_contact_method") else "missing"
    lines = [f"- contact_method: {contact_status}"]
    if facts.get("phone"):
        lines.append(f"- phone: {facts['phone']}")
    if facts.get("email"):
        lines.append(f"- email: {facts['email']}")
    address_status = "known" if facts.get("has_delivery_address") else "unknown"
    lines.append(f"- delivery_address: {address_status}")
    if facts.get("delivery_address"):
        lines.append(f"- delivery_address_value: {facts['delivery_address']}")
    return "\n".join(lines)


def _apply_contact_fact_updates(contact: Contact | None, facts: dict) -> None:
    if not contact:
        return
    if facts.get("phone") and not contact.visitor_phone:
        contact.visitor_phone = facts["phone"]
    if facts.get("email") and not contact.visitor_email:
        contact.visitor_email = facts["email"]
    if facts.get("delivery_address") and not contact.visitor_address:
        contact.visitor_address = facts["delivery_address"]


def _first_detected_address(detected_fields: dict) -> str:
    for key in ADDRESS_DETECTED_FIELD_KEYS:
        value = detected_fields.get(key)
        if value:
            return str(value).strip()
    return ""


def _has_fulfillment_detail(detected_fields: dict, facts: dict) -> bool:
    return bool(
        facts.get("has_delivery_address")
        or _first_detected_address(detected_fields)
        or detected_fields.get("pickup_preference")
    )


def _apply_order_address_contact_update(contact: Contact | None, order: dict) -> None:
    if not contact or contact.visitor_address:
        return
    detected_fields = order.get("detected_fields")
    if not isinstance(detected_fields, dict):
        return
    address = _first_detected_address(detected_fields)
    if address:
        contact.visitor_address = address


def _apply_deterministic_order_facts(scope: dict, facts: dict) -> dict:
    order = dict(scope.get("order") or _empty_order_detection())
    if not order.get("is_order_intent"):
        return scope

    detected_fields = dict(order.get("detected_fields") or {})
    if facts.get("phone"):
        detected_fields["phone"] = facts["phone"]
    if facts.get("email"):
        detected_fields["email"] = facts["email"]
    if facts.get("has_contact_method"):
        detected_fields["contact_method"] = "known"
    if facts.get("delivery_address"):
        detected_fields["delivery_address"] = facts["delivery_address"]
    else:
        detected_address = _first_detected_address(detected_fields)
        if detected_address:
            detected_fields["delivery_address"] = detected_address

    original_missing_fields = [
        str(field).strip()
        for field in (order.get("missing_fields") or [])
        if str(field).strip()
    ]
    missing_fields = [
        field
        for field in original_missing_fields
        if field.lower() not in CONTACT_METHOD_MISSING_FIELDS
    ]
    if facts.get("has_delivery_address"):
        missing_fields = [
            field
            for field in missing_fields
            if field.lower() not in ADDRESS_MISSING_FIELDS
        ]

    if not facts.get("has_contact_method"):
        missing_fields = [
            *missing_fields,
            *([] if any(field.lower() in CONTACT_METHOD_MISSING_FIELDS for field in missing_fields) else ["phone_or_email"]),
        ]
        order["is_order_ready"] = False
    elif original_missing_fields and not missing_fields:
        order["is_order_ready"] = True

    if order.get("is_order_ready") and not _has_fulfillment_detail(detected_fields, facts):
        missing_fields = [
            *missing_fields,
            *([] if any(field.lower() in ADDRESS_MISSING_FIELDS for field in missing_fields) else ["delivery_address"]),
        ]
        order["is_order_ready"] = False

    order["missing_fields"] = missing_fields
    order["detected_fields"] = detected_fields
    if missing_fields:
        order["is_order_ready"] = False

    updated_scope = dict(scope)
    updated_scope["order"] = order
    return updated_scope


def _order_missing_info_reply(missing_fields: list[str]) -> str:
    normalized = {str(field).strip().lower() for field in missing_fields}
    questions = []
    if normalized.intersection({"product", "product_or_service", "item", "service"}):
        questions.append("sản phẩm bạn muốn đặt")
    if normalized.intersection({"quantity", "purchase_scope", "scope"}):
        questions.append("số lượng")
    if normalized.intersection({"phone", "email", "phone_or_email", "contact_method"}):
        questions.append("số điện thoại liên hệ")
    if normalized.intersection({"address", "delivery_address", "delivery_or_pickup_details", "fulfillment"}):
        questions.append("địa chỉ nhận hàng hoặc hình thức nhận hàng")

    if not questions:
        questions = ["thông tin còn thiếu để hoàn tất đơn hàng"]

    if len(questions) == 1:
        return f"Bạn vui lòng cho shop xin {questions[0]} để hoàn tất đơn hàng nhé."

    return "Bạn vui lòng cho shop xin " + ", ".join(questions[:-1]) + f" và {questions[-1]} để hoàn tất đơn hàng nhé."


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


def _history_without_current_message(history: list[Message], user_message: str) -> list[Message]:
    if history and history[-1].sender_type == "contact" and history[-1].content == user_message:
        return history[:-1]
    return history


def _should_attempt_query_rewrite(user_message: str, history: list[Message]) -> bool:
    if not get_settings().AI_REWRITE_ENABLED:
        return False

    prior_history = _history_without_current_message(history, user_message)
    if not prior_history:
        return False

    normalized = " ".join((user_message or "").lower().split())
    if not normalized:
        return False

    return True


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


async def generate_ai_response_result(
    db: AsyncSession,
    conversation: Conversation,
    user_message: str,
    contact: Contact | None = None,
) -> dict:
    """Generate a customer-facing AI response and reusable intent metadata."""
    try:
        try:
            history = await _get_chat_history(db, conversation.id)
        except Exception as history_error:
            logger.warning(
                "Customer AI history lookup failed for conversation %s: %s",
                conversation.id,
                history_error,
                exc_info=True,
            )
            history = []

        deterministic_order_facts = _build_deterministic_order_facts(
            contact=contact,
            user_message=user_message,
            history=history,
        )
        _apply_contact_fact_updates(contact, deterministic_order_facts)
        scope = await classify_ai_scope(
            mode="customer_auto_reply",
            message=user_message,
            history_context=_format_history_for_rewrite(history, user_message),
            contact_context=_format_contact_context_for_customer_ai(contact),
            order_facts_context=_format_order_facts_for_classifier(deterministic_order_facts),
        )
        scope = _apply_deterministic_order_facts(scope, deterministic_order_facts)
        _apply_order_address_contact_update(contact, scope.get("order") or {})
        if not scope["should_answer"]:
            logger.info(
                "Customer AI blocked out-of-scope message:\n%s",
                pretty_log({
                    "conversation_id": conversation.id,
                    "intent": scope["intent"],
                    "confidence": scope["confidence"],
                    "reason": scope["reason"],
                    "message": user_message,
                }),
            )
            return _response_result(CUSTOMER_OUT_OF_SCOPE_REPLY, scope)
        order_detection = scope.get("order") or {}
        if order_detection.get("is_order_intent"):
            if order_detection.get("is_order_ready"):
                logger.info(
                    "Customer AI order ready from scope classifier:\n%s",
                    pretty_log({
                        "conversation_id": conversation.id,
                        "confidence": scope.get("confidence"),
                        "detected_fields": order_detection.get("detected_fields"),
                    }),
                )
                return _response_result(ORDER_READY_HANDOFF_TEXT, scope)

            reply = order_detection.get("reply") or _order_missing_info_reply(
                order_detection.get("missing_fields") or []
            )
            logger.info(
                "Customer AI order missing details from scope classifier:\n%s",
                pretty_log({
                    "conversation_id": conversation.id,
                    "confidence": scope.get("confidence"),
                    "missing_fields": order_detection.get("missing_fields"),
                    "reply": reply,
                }),
            )
            return _response_result(reply, scope)

        if scope["intent"] == "greeting":
            return _response_result(
                "Chào bạn! Shop có thể hỗ trợ bạn thông tin sản phẩm, giá hoặc chính sách mua hàng ạ.",
                scope,
            )

        try:
            current_search_result = await _search_relevant_product_refs(
                conversation.business_id,
                user_message,
            )
        except Exception as search_error:
            current_search_result = search_error

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
                "Customer AI current product search not confident; considering rewrite:\n%s",
                pretty_log({
                    "conversation_id": conversation.id,
                    "scores": _score_summary(current_search_result),
                    "top_hits": current_search_result[:5],
                }),
            )
            rewrite = None
            if _should_attempt_query_rewrite(user_message, history):
                rewrite = await _rewrite_product_query(user_message, history)
            else:
                logger.info(
                    "Customer AI rewrite skipped for conversation %s; latest message does not look context-dependent",
                    conversation.id,
                )
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
- If the customer shows purchase intent, help collect missing order details. An order is not actionable until the conversation includes a product/service, quantity or clear purchase scope, a phone/email/contact method, and delivery or pickup details when relevant.
- If purchase intent is clear but phone/contact or delivery/pickup details are missing, ask for the missing details instead of saying the order was transferred.
- Never claim that order information has been transferred to staff, that staff will process the order, or that staff will contact the customer. That handoff message is sent only by the ChatDesk system after backend validation.
- Ignore prior assistant handoff messages when deciding whether the latest customer message has enough order details.
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
        return _response_result(ai_text, scope)

    except Exception as e:
        logger.error("Error generating AI response: %s", e, exc_info=True)
        return _response_result(None)


async def generate_ai_response(
    db: AsyncSession,
    conversation: Conversation,
    user_message: str,
    contact: Contact | None = None,
) -> str | None:
    """Backward-compatible text-only customer AI response."""
    result = await generate_ai_response_result(
        db=db,
        conversation=conversation,
        user_message=user_message,
        contact=contact,
    )
    return result.get("text")
