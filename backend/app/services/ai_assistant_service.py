import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_assistant_message import AIAssistantMessage
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.product import Product
from app.models.user import User
from app.services.llm_service import create_chat_completion
from app.services.ai_service import (
    _format_product_for_ai,
    _retrieve_products_without_vector_search,
    _retrieve_relevant_products,
)
from app.services.ai_scope_service import INTERNAL_OUT_OF_SCOPE_REPLY, classify_ai_scope

logger = logging.getLogger(__name__)
CONVERSATION_CONTEXT_LIMIT = 8
SUMMARY_CONVERSATION_CONTEXT_LIMIT = 80
SYSTEM_HELP_CONTEXT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "chatdesk_help.md"

ASSISTANT_ROLE_ORDER = case(
    (AIAssistantMessage.role == "assistant", 1),
    else_=0,
)


@lru_cache(maxsize=1)
def _get_system_help_context() -> str:
    try:
        return SYSTEM_HELP_CONTEXT_PATH.read_text(encoding="utf-8").strip()
    except OSError as exc:
        logger.warning("Unable to load ChatDesk help context from %s: %s", SYSTEM_HELP_CONTEXT_PATH, exc)
        return "ChatDesk help context is unavailable."


def _business_context(business: User | None) -> str:
    if not business:
        return "Không có thông tin cửa hàng."

    rows = [
        ("Tên cửa hàng", business.business_name),
        ("Mô tả", business.business_description),
        ("Địa chỉ", business.store_address),
        ("Giờ mở cửa", business.opening_hours),
        ("Chính sách vận chuyển", business.shipping_policy),
        ("Chính sách bảo hành/đổi trả", business.warranty_policy),
        ("Phương thức thanh toán", business.payment_methods),
        ("Hotline", business.hotline or business.phone),
    ]
    lines = [f"- {label}: {value}" for label, value in rows if value]
    return "\n".join(lines) if lines else "Chưa có thông tin cửa hàng chi tiết."


async def _get_business(db: AsyncSession, business_id) -> User | None:
    result = await db.execute(select(User).where(User.id == business_id))
    return result.scalar_one_or_none()


async def _get_recent_assistant_history(
    db: AsyncSession,
    user_id,
    limit: int = 12,
) -> list[AIAssistantMessage]:
    result = await db.execute(
        select(AIAssistantMessage)
        .where(AIAssistantMessage.user_id == user_id)
        .order_by(
            AIAssistantMessage.created_at.desc(),
            ASSISTANT_ROLE_ORDER.desc(),
            AIAssistantMessage.id.desc(),
        )
        .limit(limit)
    )
    return list(reversed(result.scalars().all()))


def _format_assistant_history_for_scope(history: list[AIAssistantMessage], limit: int = 8) -> str:
    if not history:
        return "(none)"

    role_names = {
        "user": "Staff",
        "assistant": "Assistant",
    }
    lines = []
    for item in history[-limit:]:
        role = role_names.get(item.role, item.role)
        lines.append(f"{role}: {item.content}")
    return "\n".join(lines)


async def _get_recent_conversation_context(
    db: AsyncSession,
    conversation: Conversation | None,
    limit: int = CONVERSATION_CONTEXT_LIMIT,
) -> str:
    if not conversation:
        return ""

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    if not messages:
        return ""

    role_names = {
        "contact": "Khách",
        "business": "Nhân viên",
        "ai": "AI tự động",
    }
    lines = []
    for message in messages:
        role_name = role_names.get(message.sender_type, message.sender_type)
        timestamp = message.created_at.strftime("%Y-%m-%d %H:%M") if message.created_at else ""
        attachment_note = ""
        if message.attachment_filename:
            attachment_note = f" [tệp đính kèm: {message.attachment_filename}]"
        elif message.attachment_kind:
            attachment_note = f" [tệp đính kèm: {message.attachment_kind}]"
        prefix = f"- [{timestamp}] {role_name}" if timestamp else f"- {role_name}"
        lines.append(f"{prefix}: {message.content}{attachment_note}")
    return "\n".join(lines)


async def _retrieve_product_context(
    db: AsyncSession,
    business_id,
    question: str,
) -> tuple[list[Product], str]:
    try:
        products = await _retrieve_relevant_products(db, business_id, question, top_k=6)
    except Exception as retrieval_error:
        logger.warning(
            "Internal AI product retrieval skipped for business %s: %s",
            business_id,
            retrieval_error,
            exc_info=True,
        )
        products = await _retrieve_products_without_vector_search(db, business_id, limit=10)

    if not products:
        products = await _retrieve_products_without_vector_search(db, business_id, limit=10)

    if not products:
        return [], "Không tìm thấy sản phẩm liên quan trong hệ thống."

    return products, "\n".join(_format_product_for_ai(product, index) for index, product in enumerate(products, 1))


async def generate_internal_assistant_answer(
    db: AsyncSession,
    business_id,
    user_id,
    question: str,
    conversation: Conversation | None = None,
    intent: Literal["ask", "summarize_conversation"] = "ask",
) -> str:
    business = await _get_business(db, business_id)
    if intent == "summarize_conversation":
        conversation_context = await _get_recent_conversation_context(
            db,
            conversation,
            limit=SUMMARY_CONVERSATION_CONTEXT_LIMIT,
        )
        if not conversation_context:
            return "Chưa có tin nhắn nào trong hội thoại khách hàng đang mở để tóm tắt."

        system_prompt = f"""Bạn là trợ lý AI nội bộ cho nhân viên của cửa hàng.

Nhiệm vụ:
- Tóm tắt chỉ riêng cuộc hội thoại giữa doanh nghiệp và khách hàng đang mở.
- Không tóm tắt lịch sử chat giữa nhân viên và trợ lý AI nội bộ.
- Chỉ dựa vào các tin nhắn khách hàng/nhân viên/AI tự động được cung cấp bên dưới.
- Nếu thông tin chưa đủ, nói rõ là bạn chỉ tóm tắt dựa trên các tin nhắn được cung cấp.
- Trả lời ngắn gọn, rõ ràng, ưu tiên việc nhân viên cần làm tiếp theo.
- Không tự gửi tin nhắn ra Facebook/Instagram/Telegram/Widget.

Hãy trình bày theo các mục:
1. Nhu cầu của khách hàng
2. Nội dung đã trao đổi
3. Vấn đề còn mở
4. Bước tiếp theo nên làm

=== THÔNG TIN CỬA HÀNG ===
{_business_context(business)}

=== HỘI THOẠI KHÁCH HÀNG ĐANG MỞ ===
{conversation_context}
"""

        chat_completion = await create_chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
            temperature=0.2,
            max_tokens=1000,
        )
        return chat_completion.choices[0].message.content or "Mình chưa tạo được bản tóm tắt phù hợp."

    assistant_history = await _get_recent_assistant_history(db, user_id)
    conversation_context = await _get_recent_conversation_context(db, conversation)
    scope_context = _format_assistant_history_for_scope(assistant_history)
    if conversation_context:
        scope_context += f"\n\nActive customer conversation:\n{conversation_context}"

    scope = await classify_ai_scope(
        mode="internal_assistant",
        message=question,
        history_context=scope_context,
    )
    if not scope["should_answer"]:
        logger.info(
            "Internal AI assistant blocked out-of-scope message for user %s: %s",
            user_id,
            scope,
        )
        return INTERNAL_OUT_OF_SCOPE_REPLY

    _, product_context = await _retrieve_product_context(db, business_id, question)

    system_prompt = f"""Bạn là trợ lý AI nội bộ cho nhân viên của cửa hàng.

Mục tiêu:
- Trả lời ngắn gọn, chính xác, thực dụng cho nhân viên.
- Dựa vào dữ liệu cửa hàng và sản phẩm bên dưới.
- Có thể nêu dữ liệu thô như SKU, danh mục, giá, trạng thái, tồn kho.
- Nếu sản phẩm không có số lượng tồn kho, nói rõ: "không có thông tin tồn kho".
- Nếu không tìm thấy dữ liệu phù hợp, nói rõ là chưa có dữ liệu trong hệ thống.
- Không bịa thông tin.
- Nếu nhân viên hỏi về cách dùng ChatDesk, lỗi hệ thống hoặc cần liên hệ hỗ trợ, hãy dựa vào phần KIẾN THỨC HỆ THỐNG CHATDESK.
- Không tự gửi tin nhắn ra Facebook/Instagram/Telegram/Widget. Đây chỉ là tư vấn nội bộ.
- Trả lời bằng cùng ngôn ngữ với câu hỏi nếu có thể.

=== THÔNG TIN CỬA HÀNG ===
{_business_context(business)}

=== KIẾN THỨC HỆ THỐNG CHATDESK ===
{_get_system_help_context()}

=== SẢN PHẨM LIÊN QUAN / DỮ LIỆU STRUCTURED ===
{product_context}
"""

    if conversation_context:
        system_prompt += f"\n\n=== NGỮ CẢNH HỘI THOẠI ĐANG MỞ ===\n{conversation_context}"

    messages = [{"role": "system", "content": system_prompt}]
    for item in assistant_history:
        role = "assistant" if item.role == "assistant" else "user"
        messages.append({"role": role, "content": item.content})
    messages.append({"role": "user", "content": question})

    chat_completion = await create_chat_completion(
        messages=messages,
        temperature=0.2,
        max_tokens=800,
    )
    return chat_completion.choices[0].message.content or "Mình chưa tạo được câu trả lời phù hợp."
