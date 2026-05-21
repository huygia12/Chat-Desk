import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.conversation import Conversation
from app.models.contact import Contact
from app.models.device_token import DeviceToken
from app.models.message import Message

logger = logging.getLogger(__name__)
settings = get_settings()


async def send_conversation_push(
    db: AsyncSession,
    conversation: Conversation,
    message: Message,
    contact: Contact | None = None,
) -> None:
    if message.sender_type != "contact":
        return

    recipient_user_ids = {conversation.business_id}
    if conversation.assigned_to_id:
        recipient_user_ids.add(conversation.assigned_to_id)

    result = await db.execute(
        select(DeviceToken).where(
            DeviceToken.business_id == conversation.business_id,
            DeviceToken.user_id.in_(recipient_user_ids),
        )
    )
    devices = result.scalars().all()
    if not devices:
        return

    title = contact.display_name if contact and contact.display_name else "Tin nhan moi"
    body = message.content[:180] if message.content else "Khach hang da gui tep dinh kem"
    payloads = [
        {
            "to": device.expo_push_token,
            "title": title,
            "body": body,
            "data": {
                "type": "new_message",
                "conversation_id": str(conversation.id),
            },
            "sound": "default",
        }
        for device in devices
    ]

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(settings.EXPO_PUSH_URL, json=payloads)
            response.raise_for_status()
    except Exception as exc:
        logger.warning("Failed to send Expo push notification: %s", exc)
