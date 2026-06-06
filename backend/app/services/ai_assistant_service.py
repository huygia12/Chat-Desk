import logging
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

logger = logging.getLogger(__name__)
CONVERSATION_CONTEXT_LIMIT = 8
SUMMARY_CONVERSATION_CONTEXT_LIMIT = 80

ASSISTANT_ROLE_ORDER = case(
    (AIAssistantMessage.role == "assistant", 1),
    else_=0,
)


SYSTEM_HELP_CONTEXT = """
ChatDesk la he thong CRM/chat da kenh cho doanh nghiep.

Chuc nang chinh:
- Chat: xem va tra loi hoi thoai tu Facebook, Instagram, Telegram va Widget website. Co the gui text, emoji, file/anh, xem chi tiet visitor, gan label, gan nguoi phu trach va bat/tat AI tu dong cho tung hoi thoai.
- AI tu dong: tra loi khach hang dua tren thong tin cua hang va danh muc san pham. Nut "AI tu dong" trong header hoi thoai chi anh huong luong tra loi khach hang, khong lien quan den tro ly AI noi bo.
- Tro ly AI noi bo: nut "Tro ly AI" tren header app. Day la noi nhan vien hoi ve san pham, ton kho, cach dung he thong va loi thuong gap. Tro ly nay chi tra loi trong modal, khong tu gui tin ra ngoai.
- Products/San pham: quan ly ten san pham, SKU, danh muc, mo ta, gia, trang thai con hang/het hang, so luong ton kho va extra_info. AI dung du lieu nay de tim va tra loi ve san pham.
- Settings/Thong tin doanh nghiep: quan ly ten cua hang, mo ta, dia chi, gio mo cua, chinh sach van chuyen, bao hanh/doi tra, phuong thuc thanh toan, hotline. AI dung cac thong tin nay lam ngu canh.
- Channels/Kenh ket noi: ket noi Meta OAuth cho Facebook Page va Instagram Professional account, ket noi Telegram bot bang Bot Token, va quan ly cac kenh da ket noi.
- Widgets: tao widget chat website, cau hinh allowed origins, copy ma nhung vao website. Widget chi hoat dong tren domain duoc phep.
- Saved Replies: tao mau cau tra loi nhanh, co the go shortcut bat dau bang "/" trong o chat.
- Labels: tao nhan khach hang va gan vao contact/conversation.
- Assignment: cau hinh phan cong hoi thoai, nhan vien co the bi khoa quyen tu doi assignee neu doanh nghiep bat cau hinh khoa.
- Employees: doanh nghiep tao va quan ly tai khoan nhan vien.

Huong dan loi thuong gap:
- Khong nhan duoc webhook Facebook/Instagram: kiem tra callback URL, verify token, ngrok/API_URL public, subscription fields messages, channel token va log backend.
- Khong gui duoc Facebook/Instagram: kiem tra app role/tester, pages_messaging/instagram permissions, app mode, page access token, nguoi nhan co thuoc pham vi test/review hay khong.
- Khong gui duoc file sang Meta: file URL phai public qua API_URL/ngrok/domain that, robots.txt phai cho Meta user-agent tai /api/files, backend can restart sau khi doi .env API_URL.
- Widget khong hien/khong gui: kiem tra allowed_origins, widget_id/widget_secret, domain dung https va browser console.
- AI tra loi sai/khong tim thay san pham: kiem tra du lieu Products, status, stock_quantity, extra_info, sau khi sua nhieu san pham cu nen rebuild Milvus embeddings.
- Neu can ho tro ky thuat: lien he doi phat trien/quan tri he thong qua email lamkhoi.dev@gmail.com va gui kem business email, thoi diem loi, kenh bi loi, conversation id neu co, anh chup man hinh va log backend.
"""


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
    _, product_context = await _retrieve_product_context(db, business_id, question)
    conversation_context = await _get_recent_conversation_context(db, conversation)

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
{SYSTEM_HELP_CONTEXT}

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
