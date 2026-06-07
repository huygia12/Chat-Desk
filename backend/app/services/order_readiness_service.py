import asyncio
import json
import logging
import unicodedata

from app.config import get_settings
from app.models.contact import Contact
from app.models.message import Message
from app.services.llm_service import create_chat_completion

logger = logging.getLogger(__name__)

ORDER_READY_TRIGGER = "order_ready"

ORDER_READY_KEYWORDS = {
    "chot",
    "dat",
    "mua",
    "lay",
    "giao",
    "ship",
    "sdt",
    "so dien thoai",
    "dia chi",
    "address",
    "phone",
    "order",
    "buy",
    "deliver",
}

PHONE_PATTERN = r"(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)"
EMAIL_PATTERN = r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"
FULFILLMENT_KEYWORDS = {
    "dia chi",
    "giao den",
    "giao toi",
    "ship den",
    "ship toi",
    "nhan tai",
    "qua lay",
    "den lay",
    "pickup",
    "delivery",
    "address",
}


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


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    without_marks = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return without_marks.replace("đ", "d").replace("Đ", "D").lower()


def _looks_like_order_candidate(user_message: str, history: list[Message]) -> bool:
    recent_text = "\n".join(
        [*(message.content or "" for message in history[-8:]), user_message or ""]
    )
    normalized = _normalize_text(recent_text)
    return any(keyword in normalized for keyword in ORDER_READY_KEYWORDS)


def _format_history(history: list[Message], limit: int = 10) -> str:
    role_names = {
        "contact": "Customer",
        "business": "Staff",
        "ai": "Assistant",
    }
    lines = []
    for message in history[-limit:]:
        role = role_names.get(message.sender_type, message.sender_type)
        content = (message.content or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else "(no previous conversation)"


def _contact_context(contact: Contact | None) -> str:
    if not contact:
        return "(no contact profile)"

    rows = [
        ("display_name", contact.display_name),
        ("visitor_email", contact.visitor_email),
        ("visitor_phone", contact.visitor_phone),
    ]
    lines = [f"- {key}: {value}" for key, value in rows if value]
    return "\n".join(lines) if lines else "(no contact profile)"


def _recent_customer_text(user_message: str, history: list[Message]) -> str:
    return "\n".join(
        [
            *(message.content or "" for message in history[-12:] if message.sender_type == "contact"),
            user_message or "",
        ]
    )


def _has_contact_method(contact: Contact | None, text: str) -> bool:
    if contact and (contact.visitor_phone or contact.visitor_email):
        return True

    import re

    return bool(
        re.search(PHONE_PATTERN, text)
        or re.search(EMAIL_PATTERN, text, flags=re.IGNORECASE)
    )


def _has_fulfillment_details(text: str) -> bool:
    normalized = _normalize_text(text)
    return any(keyword in normalized for keyword in FULFILLMENT_KEYWORDS)


def _has_required_order_details(contact: Contact | None, user_message: str, history: list[Message]) -> tuple[bool, list[str]]:
    text = _recent_customer_text(user_message, history)
    missing_fields = []

    if not _has_contact_method(contact, text):
        missing_fields.append("phone_or_email")

    if not _has_fulfillment_details(text):
        missing_fields.append("delivery_or_pickup_details")

    return not missing_fields, missing_fields


def _normalize_detection_payload(payload: dict) -> dict:
    missing_fields = payload.get("missing_fields")
    if not isinstance(missing_fields, list):
        missing_fields = []

    confidence = payload.get("confidence", 0.0)
    try:
        confidence = max(0.0, min(float(confidence), 1.0))
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "is_order_ready": bool(payload.get("is_order_ready")),
        "confidence": confidence,
        "missing_fields": [str(item)[:80] for item in missing_fields],
        "detected_fields": payload.get("detected_fields") if isinstance(payload.get("detected_fields"), dict) else {},
        "reason": str(payload.get("reason") or "").strip()[:500],
    }


async def detect_order_readiness(
    *,
    user_message: str,
    history: list[Message],
    contact: Contact | None = None,
) -> dict:
    settings = get_settings()
    if not settings.AI_ORDER_READY_DETECTION_ENABLED:
        return {
            "is_order_ready": False,
            "confidence": 0.0,
            "missing_fields": [],
            "detected_fields": {},
            "reason": "order readiness detection disabled",
        }

    if not _looks_like_order_candidate(user_message, history):
        return {
            "is_order_ready": False,
            "confidence": 0.0,
            "missing_fields": [],
            "detected_fields": {},
            "reason": "no order-ready signal in recent conversation",
        }

    messages = [
        {
            "role": "system",
            "content": (
                "You classify whether a customer has provided enough information for staff to process an order. "
                "Return only JSON. Do not write prose outside JSON. "
                "Set is_order_ready=true only when the customer clearly intends to buy/order and the conversation "
                "contains enough actionable details for a human staff member to follow up. "
                "Required evidence: product or service, quantity or clear purchase scope, contact method "
                "(phone/email/profile) and delivery/pickup/contact details when relevant. "
                "Do not mark ready for price checks, stock checks, comparisons, vague interest, or 'I will think about it'. "
                "If important details are missing, set is_order_ready=false and list missing_fields. "
                "Return JSON keys: is_order_ready, confidence, missing_fields, detected_fields, reason."
            ),
        },
        {
            "role": "user",
            "content": (
                "Contact profile:\n"
                f"{_contact_context(contact)}\n\n"
                "Recent conversation:\n"
                f"{_format_history(history)}\n\n"
                f"Latest customer message:\n{user_message}\n\n"
                "Return JSON only."
            ),
        },
    ]

    try:
        completion = await asyncio.wait_for(
            create_chat_completion(
                messages=messages,
                temperature=0.0,
                max_tokens=260,
            ),
            timeout=settings.AI_ORDER_READY_TIMEOUT_SECONDS,
        )
        payload = _extract_json_object(completion.choices[0].message.content or "")
        result = _normalize_detection_payload(payload)
        has_required_details, missing_fields = _has_required_order_details(contact, user_message, history)
        if not has_required_details:
            result["is_order_ready"] = False
            result["missing_fields"] = sorted(set([*result["missing_fields"], *missing_fields]))
            result["reason"] = (
                "Required order contact/fulfillment details are missing; "
                f"detector reason: {result['reason']}"
            )[:500]
        if result["confidence"] < settings.AI_ORDER_READY_CONFIDENCE_THRESHOLD:
            result["is_order_ready"] = False
        return result
    except Exception as exc:
        logger.warning("Order readiness detection failed: %s", exc, exc_info=True)
        return {
            "is_order_ready": False,
            "confidence": 0.0,
            "missing_fields": [],
            "detected_fields": {},
            "reason": "order readiness detector failed",
        }
