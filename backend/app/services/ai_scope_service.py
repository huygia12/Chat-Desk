import asyncio
import json
import logging
from typing import Literal

from app.config import get_settings
from app.services.llm_service import create_chat_completion

logger = logging.getLogger(__name__)

AIScopeMode = Literal["customer_auto_reply", "internal_assistant"]

CUSTOMER_OUT_OF_SCOPE_REPLY = (
    "Xin lỗi, hiện tôi chỉ có thể hỗ trợ thông tin về sản phẩm, chính sách và dữ liệu của cửa hàng trong hệ thống."
)
INTERNAL_OUT_OF_SCOPE_REPLY = (
    "Không có đủ dữ liệu trong hệ thống để trả lời câu hỏi này."
)


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


def _classify_scope_locally(message: str, _mode: AIScopeMode) -> dict | None:
    if not any(char.isalnum() for char in message or ""):
        return {
            "intent": "greeting",
            "should_answer": True,
            "confidence": 1.0,
            "reason": "empty or punctuation-only message",
            "order": _empty_order_detection(),
        }

    return None


def _parse_bool(value, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
    return default


def _empty_order_detection() -> dict:
    return {
        "is_order_intent": False,
        "is_order_ready": False,
        "missing_fields": [],
        "detected_fields": {},
        "reply": "",
    }


def _normalize_order_detection(payload: dict, intent: str) -> dict:
    raw_order = payload.get("order")
    if not isinstance(raw_order, dict):
        raw_order = {}

    missing_fields = raw_order.get("missing_fields")
    if not isinstance(missing_fields, list):
        missing_fields = []

    detected_fields = raw_order.get("detected_fields")
    if not isinstance(detected_fields, dict):
        detected_fields = {}

    is_order_intent = _parse_bool(
        raw_order.get("is_order_intent"),
        default=intent == "order_request",
    )
    is_order_ready = _parse_bool(raw_order.get("is_order_ready"), default=False)
    if not is_order_intent:
        is_order_ready = False

    return {
        "is_order_intent": is_order_intent,
        "is_order_ready": is_order_ready,
        "missing_fields": [str(item).strip()[:80] for item in missing_fields if str(item).strip()],
        "detected_fields": {
            str(key).strip()[:80]: str(value).strip()[:500]
            for key, value in detected_fields.items()
            if str(key).strip() and value is not None and str(value).strip()
        },
        "reply": str(raw_order.get("reply") or "").strip()[:500],
    }


def _normalize_scope_payload(payload: dict, mode: AIScopeMode) -> dict:
    intent = str(payload.get("intent") or "out_of_scope").strip().lower()
    should_answer = _parse_bool(payload.get("should_answer"), default=False)
    confidence = payload.get("confidence", 0.0)
    try:
        confidence = max(0.0, min(float(confidence), 1.0))
    except (TypeError, ValueError):
        confidence = 0.0

    allowed_intents = {
        "product_question",
        "business_policy",
        "store_info",
        "conversation_followup",
        "greeting",
    }
    if mode == "customer_auto_reply":
        allowed_intents.add("order_request")
    if mode == "internal_assistant":
        allowed_intents.add("chatdesk_support")

    if intent not in allowed_intents:
        should_answer = False

    order = _normalize_order_detection(payload, intent)
    if mode != "customer_auto_reply":
        order = _empty_order_detection()
    elif order["is_order_intent"]:
        intent = "order_request"
        should_answer = True

    return {
        "intent": intent,
        "should_answer": should_answer,
        "confidence": confidence,
        "reason": str(payload.get("reason") or "").strip()[:500],
        "order": order,
    }


def _scope_system_prompt(mode: AIScopeMode) -> str:
    if mode == "customer_auto_reply":
        allowed_scope = (
            "Allowed scope: customer questions about the business' products, stock, price, SKU, variants, "
            "shipping, warranty/returns, payment, address, opening hours, hotline, order/sales conversation "
            "follow-ups, and short greetings that a shop assistant can answer."
        )
        mode_rule = (
            "This is a customer-facing auto-reply. It must not answer general knowledge, public figures, "
            "politics, history, news, weather, sports, medical, legal, financial advice, coding, schoolwork, "
            "or any topic unrelated to the shop's own data."
        )
    else:
        allowed_scope = (
            "Allowed scope: internal staff questions about the business' products, inventory, shop policies, "
            "business settings, active customer conversation context, and how to use or troubleshoot ChatDesk."
        )
        mode_rule = (
            "This is an internal assistant. It must not answer general knowledge, public figures, politics, "
            "history, news, weather, sports, medical, legal, financial advice, coding, schoolwork, or topics "
            "unrelated to the business system data."
        )

    return (
        "You are a strict scope classifier for an enterprise chat AI.\n"
        f"{allowed_scope}\n"
        f"{mode_rule}\n"
        "Classify only whether the assistant is allowed to attempt an answer from business/system data.\n"
        "If the user asks about a famous person, public event, historical fact, political leader, or any "
        "external-world fact not tied to the shop, set intent='out_of_scope' and should_answer=false.\n"
        "If the message is ambiguous but could be a product/order/shop follow-up, allow it as "
        "conversation_followup.\n"
        "For customer auto-replies, also classify order readiness in an 'order' object. "
        "Set intent='order_request' and order.is_order_intent=true when the customer is trying to buy, "
        "place an order, confirm they want an item, or provides order details such as phone/address after "
        "a purchase discussion. An order is ready only when the recent context contains: product/service "
        "or clear item reference, quantity or clear purchase scope, phone/email/contact method from the "
        "conversation or contact profile, and delivery/pickup details when relevant. "
        "Treat Known deterministic order facts as authoritative. Do not mark phone/email/contact_method "
        "missing when those facts say contact_method=known. Do not invent phone/email; only use the values "
        "from deterministic facts. Do not mark delivery_address/fulfillment missing when deterministic facts "
        "say delivery_address=known. Extract delivery_address/fulfillment details from the recent customer "
        "conversation when the customer provides a delivery location or pickup preference, and put the "
        "extracted address in detected_fields.delivery_address. "
        "If order details are missing, set order.is_order_ready=false, list missing_fields, and put one "
        "short Vietnamese question in order.reply asking only for the missing details. "
        "If the order is ready, leave order.reply empty; the backend will send the fixed handoff message.\n"
        "Return only JSON with keys: intent, should_answer, confidence, reason, order.\n"
        "Allowed intents: product_question, business_policy, store_info, chatdesk_support, "
        "conversation_followup, greeting, order_request, out_of_scope.\n"
        "Order object keys: is_order_intent, is_order_ready, missing_fields, detected_fields, reply. "
        "Use detected_fields keys when available: product, quantity, contact_method, phone, email, "
        "delivery_address, pickup_preference."
    )


async def classify_ai_scope(
    *,
    mode: AIScopeMode,
    message: str,
    history_context: str = "",
    contact_context: str = "",
    order_facts_context: str = "",
) -> dict:
    settings = get_settings()
    local_scope = _classify_scope_locally(message, mode)
    if local_scope:
        return local_scope

    messages = [
        {"role": "system", "content": _scope_system_prompt(mode)},
        {
            "role": "user",
            "content": (
                f"Contact profile:\n{contact_context or '(none)'}\n\n"
                f"Known deterministic order facts:\n{order_facts_context or '(none)'}\n\n"
                f"Recent context:\n{history_context or '(none)'}\n\n"
                f"Latest message:\n{message}\n\n"
                "Return JSON only."
            ),
        },
    ]

    try:
        completion = await asyncio.wait_for(
            create_chat_completion(
                messages=messages,
                temperature=0.0,
                max_tokens=360,
            ),
            timeout=settings.AI_REWRITE_TIMEOUT_SECONDS,
        )
        payload = _extract_json_object(completion.choices[0].message.content or "")
        return _normalize_scope_payload(payload, mode)
    except Exception as exc:
        logger.warning("AI scope classification failed for %s: %s", mode, exc, exc_info=True)
        return {
            "intent": "classification_failed",
            "should_answer": True,
            "confidence": 0.0,
            "reason": "scope classifier failed; falling back to existing flow",
            "order": _empty_order_detection(),
        }
