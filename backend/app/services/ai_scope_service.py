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
    if mode == "internal_assistant":
        allowed_intents.add("chatdesk_support")

    if intent not in allowed_intents:
        should_answer = False

    return {
        "intent": intent,
        "should_answer": should_answer,
        "confidence": confidence,
        "reason": str(payload.get("reason") or "").strip()[:500],
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
        "Return only JSON with keys: intent, should_answer, confidence, reason.\n"
        "Allowed intents: product_question, business_policy, store_info, chatdesk_support, "
        "conversation_followup, greeting, out_of_scope."
    )


async def classify_ai_scope(
    *,
    mode: AIScopeMode,
    message: str,
    history_context: str = "",
) -> dict:
    settings = get_settings()
    messages = [
        {"role": "system", "content": _scope_system_prompt(mode)},
        {
            "role": "user",
            "content": (
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
                max_tokens=160,
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
        }
