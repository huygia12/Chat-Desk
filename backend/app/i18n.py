from __future__ import annotations

from contextvars import ContextVar
from typing import Any

from fastapi import Request

DEFAULT_LANGUAGE = "vi"
SUPPORTED_LANGUAGES = {"vi", "en"}

_current_language: ContextVar[str] = ContextVar("current_language", default=DEFAULT_LANGUAGE)


TRANSLATIONS: dict[str, dict[str, str]] = {
    "Email already registered": {
        "vi": "Email đã được đăng ký",
        "en": "Email already registered",
    },
    "Invalid email or password": {
        "vi": "Email hoặc mật khẩu không đúng",
        "en": "Invalid email or password",
    },
    "Could not validate credentials": {
        "vi": "Không thể xác thực thông tin đăng nhập",
        "en": "Could not validate credentials",
    },
    "Account is disabled": {
        "vi": "Tài khoản đã bị vô hiệu hóa",
        "en": "Account is disabled",
    },
    "Access denied": {
        "vi": "Bạn không có quyền truy cập",
        "en": "Access denied",
    },
    "Admin access required": {
        "vi": "Yêu cầu quyền admin",
        "en": "Admin access required",
    },
    "Only business users can perform this action": {
        "vi": "Chỉ tài khoản doanh nghiệp mới có thể thực hiện thao tác này",
        "en": "Only business users can perform this action",
    },
    "Only employees can perform this action": {
        "vi": "Chỉ nhân viên mới có thể thực hiện thao tác này",
        "en": "Only employees can perform this action",
    },
    "Business users can only create business templates": {
        "vi": "Tài khoản doanh nghiệp chỉ có thể tạo mẫu trả lời chung",
        "en": "Business users can only create business templates",
    },
    "Employees can only create personal templates": {
        "vi": "Nhân viên chỉ có thể tạo mẫu trả lời cá nhân",
        "en": "Employees can only create personal templates",
    },
    "Conversation is required": {
        "vi": "Cần có hội thoại",
        "en": "Conversation is required",
    },
    "Conversation not found": {
        "vi": "Không tìm thấy hội thoại",
        "en": "Conversation not found",
    },
    "Instagram reply window is closed. Ask the customer to send a new message before replying.": {
        "vi": "Cửa sổ trả lời Instagram đã đóng. Hãy yêu cầu khách hàng gửi tin nhắn mới trước khi trả lời.",
        "en": "Instagram reply window is closed. Ask the customer to send a new message before replying.",
    },
    "Facebook reply window is closed. Ask the customer to send a new message before replying.": {
        "vi": "Cửa sổ trả lời Facebook đã đóng. Hãy yêu cầu khách hàng gửi tin nhắn mới trước khi trả lời.",
        "en": "Facebook reply window is closed. Ask the customer to send a new message before replying.",
    },
    "Contact not found": {
        "vi": "Không tìm thấy liên hệ",
        "en": "Contact not found",
    },
    "Label not found": {
        "vi": "Không tìm thấy label",
        "en": "Label not found",
    },
    "Label name is required": {
        "vi": "Tên label là bắt buộc",
        "en": "Label name is required",
    },
    "Label name already exists": {
        "vi": "Tên label đã tồn tại",
        "en": "Label name already exists",
    },
    "Invalid AI auto-apply trigger": {
        "vi": "Cau hinh tu dong gan label bang AI khong hop le",
        "en": "Invalid AI auto-apply trigger",
    },
    "Order ready handoff message": {
        "vi": (
            "Th\u00f4ng tin \u0111\u1eb7t h\u00e0ng c\u1ee7a b\u1ea1n \u0111\u00e3 "
            "\u0111\u01b0\u1ee3c chuy\u1ec3n cho nh\u00e2n vi\u00ean, "
            "ch\u00fang t\u00f4i s\u1ebd x\u1eed l\u00fd v\u00e0 li\u00ean "
            "l\u1ea1c l\u1ea1i ngay."
        ),
        "en": (
            "Your order information has been sent to our staff. "
            "We will process it and contact you shortly."
        ),
    },
    "Product not found": {
        "vi": "Không tìm thấy sản phẩm",
        "en": "Product not found",
    },
    "Maximum 50 products per import": {
        "vi": "Mỗi lần import tối đa 50 sản phẩm",
        "en": "Maximum 50 products per import",
    },
    "Widget not found": {
        "vi": "Không tìm thấy widget",
        "en": "Widget not found",
    },
    "Invalid widget credentials": {
        "vi": "Thông tin xác thực widget không hợp lệ",
        "en": "Invalid widget credentials",
    },
    "Message text cannot be empty": {
        "vi": "Nội dung tin nhắn không được để trống",
        "en": "Message text cannot be empty",
    },
    "Password must be at least 6 characters": {
        "vi": "Mật khẩu phải có ít nhất 6 ký tự",
        "en": "Password must be at least 6 characters",
    },
    "Full name is required": {
        "vi": "Họ tên là bắt buộc",
        "en": "Full name is required",
    },
    "Current password is incorrect": {
        "vi": "Mật khẩu hiện tại không đúng",
        "en": "Current password is incorrect",
    },
    "Employee not found": {
        "vi": "Không tìm thấy nhân viên",
        "en": "Employee not found",
    },
    "Password updated": {
        "vi": "Đã cập nhật mật khẩu",
        "en": "Password updated",
    },
    "This Facebook Page is already connected": {
        "vi": "Facebook Page này đã được kết nối",
        "en": "This Facebook Page is already connected",
    },
    "Instagram Account ID va Access Token la bat buoc": {
        "vi": "Instagram Account ID và Access Token là bắt buộc",
        "en": "Instagram Account ID and Access Token are required",
    },
    "This Instagram account is already connected": {
        "vi": "Tài khoản Instagram này đã được kết nối",
        "en": "This Instagram account is already connected",
    },
    (
        "Khong the xac thuc Instagram account. Hay dung Instagram Professional "
        "account da lien ket voi Facebook Page va Page Access Token co quyen messaging."
    ): {
        "vi": (
            "Không thể xác thực Instagram account. Hãy dùng Instagram Professional account "
            "đã liên kết với Facebook Page và Page Access Token có quyền messaging."
        ),
        "en": (
            "Could not verify the Instagram account. Use an Instagram Professional account "
            "linked to a Facebook Page and a Page Access Token with messaging permissions."
        ),
    },
    "Channel not found": {
        "vi": "Không tìm thấy kênh kết nối",
        "en": "Channel not found",
    },
    "Bot token không hợp lệ. Kiểm tra lại token từ @BotFather.": {
        "vi": "Bot token không hợp lệ. Kiểm tra lại token từ @BotFather.",
        "en": "Invalid bot token. Please check the token from @BotFather.",
    },
    "Không thể đăng ký webhook với Telegram. Thử lại sau.": {
        "vi": "Không thể đăng ký webhook với Telegram. Thử lại sau.",
        "en": "Could not register the Telegram webhook. Please try again later.",
    },
    "Employee assignment changes are locked": {
        "vi": "Thay đổi phân công của nhân viên đang bị khóa",
        "en": "Employee assignment changes are locked",
    },
    "Assignee not found": {
        "vi": "Không tìm thấy người được phân công",
        "en": "Assignee not found",
    },
    "Shortcut is required": {
        "vi": "Shortcut là bắt buộc",
        "en": "Shortcut is required",
    },
    "Shortcut can only contain letters, numbers, hyphen, and underscore": {
        "vi": "Shortcut chỉ được chứa chữ cái, số, dấu gạch ngang và gạch dưới",
        "en": "Shortcut can only contain letters, numbers, hyphen, and underscore",
    },
    "Shortcut already exists": {
        "vi": "Shortcut đã tồn tại",
        "en": "Shortcut already exists",
    },
    "Saved reply not found": {
        "vi": "Không tìm thấy mẫu trả lời",
        "en": "Saved reply not found",
    },
    "Verification failed": {
        "vi": "Xác minh thất bại",
        "en": "Verification failed",
    },
    "Not Found": {
        "vi": "Không tìm thấy tài nguyên",
        "en": "Not Found",
    },
    "Method Not Allowed": {
        "vi": "Phương thức không được hỗ trợ",
        "en": "Method Not Allowed",
    },
    "File is too large": {
        "vi": "File quá lớn",
        "en": "File is too large",
    },
    "File not found": {
        "vi": "Không tìm thấy file",
        "en": "File not found",
    },
    "Label deleted": {
        "vi": "Đã xóa label",
        "en": "Label deleted",
    },
    "Saved reply deleted": {
        "vi": "Đã xóa mẫu trả lời",
        "en": "Saved reply deleted",
    },
    "Product deleted": {
        "vi": "Đã xóa sản phẩm",
        "en": "Product deleted",
    },
    "Channel disconnected": {
        "vi": "Đã ngắt kết nối kênh",
        "en": "Channel disconnected",
    },
}

FIELD_LABELS: dict[str, dict[str, str]] = {
    "Title": {"vi": "Tiêu đề", "en": "Title"},
    "Content": {"vi": "Nội dung", "en": "Content"},
}

VALIDATION_TRANSLATIONS: dict[str, dict[str, str]] = {
    "Field required": {
        "vi": "Trường này là bắt buộc",
        "en": "Field required",
    },
    "Input should be a valid string": {
        "vi": "Giá trị phải là chuỗi hợp lệ",
        "en": "Input should be a valid string",
    },
    "Input should be a valid integer": {
        "vi": "Giá trị phải là số nguyên hợp lệ",
        "en": "Input should be a valid integer",
    },
    "Input should be a valid boolean": {
        "vi": "Giá trị phải là boolean hợp lệ",
        "en": "Input should be a valid boolean",
    },
}


def normalize_language(value: str | None) -> str:
    if not value:
        return DEFAULT_LANGUAGE

    language = value.strip().lower().replace("_", "-")
    if not language:
        return DEFAULT_LANGUAGE

    primary = language.split("-", 1)[0]
    return primary if primary in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def get_request_language(request: Request) -> str:
    header_language = request.headers.get("x-language") or request.headers.get("x-locale")
    if header_language:
        return normalize_language(header_language)

    accept_language = request.headers.get("accept-language")
    if accept_language:
        for part in accept_language.split(","):
            language = normalize_language(part.split(";", 1)[0])
            if language in SUPPORTED_LANGUAGES:
                return language

    return DEFAULT_LANGUAGE


def get_current_language() -> str:
    return _current_language.get()


def set_current_language(language: str):
    return _current_language.set(normalize_language(language))


def reset_current_language(token: Any) -> None:
    _current_language.reset(token)


def t(message: str, language: str | None = None, **params: Any) -> str:
    lang = normalize_language(language or get_current_language())
    translated = TRANSLATIONS.get(message, {}).get(lang)
    if translated is None:
        translated = TRANSLATIONS.get(message, {}).get(DEFAULT_LANGUAGE, message)
    return translated.format(**params)


def translate_detail(detail: Any, language: str | None = None) -> Any:
    if not isinstance(detail, str):
        return detail

    lang = normalize_language(language or get_current_language())

    if detail.endswith(" is required"):
        field_name = detail.removesuffix(" is required")
        field_label = FIELD_LABELS.get(field_name, {}).get(lang, field_name)
        return {
            "vi": f"{field_label} là bắt buộc",
            "en": f"{field_label} is required",
        }[lang]

    if detail.startswith("Failed to send message: "):
        reason = detail.removeprefix("Failed to send message: ")
        return {
            "vi": f"Gửi tin nhắn thất bại: {reason}",
            "en": f"Failed to send message: {reason}",
        }[lang]

    if detail.startswith("Bot @") and detail.endswith(" đã được kết nối rồi."):
        bot_username = detail.removeprefix("Bot @").removesuffix(" đã được kết nối rồi.")
        return {
            "vi": f"Bot @{bot_username} đã được kết nối rồi.",
            "en": f"Bot @{bot_username} is already connected.",
        }[lang]

    return t(detail, lang)


def translate_validation_message(message: str, language: str | None = None) -> str:
    lang = normalize_language(language or get_current_language())
    return VALIDATION_TRANSLATIONS.get(message, {}).get(lang, message)
