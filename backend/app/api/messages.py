import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select
from app.database import get_db
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.channel import Channel
from app.schemas.message import MessageCreate, MessageOut, MessagePageOut
from app.api.deps import get_current_business_or_employee, get_effective_business_id
from app.services.facebook_service import send_facebook_attachment, send_facebook_message
from app.services.file_storage import save_upload_file
from app.services.instagram_service import send_instagram_attachment, send_instagram_message
from app.services.telegram_service import send_telegram_attachment, send_telegram_message
from app.websocket.manager import manager

router = APIRouter(prefix="/api/conversations", tags=["messages"])
logger = logging.getLogger(__name__)


def serialize_message(message: Message) -> dict:
    return {
        "id": str(message.id),
        "conversation_id": str(message.conversation_id),
        "sender_type": message.sender_type,
        "content": message.content,
        "platform_message_id": message.platform_message_id,
        "attachment_url": message.attachment_url,
        "attachment_filename": message.attachment_filename,
        "attachment_mime_type": message.attachment_mime_type,
        "attachment_size": message.attachment_size,
        "attachment_kind": message.attachment_kind,
        "created_at": message.created_at.isoformat(),
    }


async def get_sendable_conversation(
    conversation_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> Conversation:
    from sqlalchemy.orm import joinedload

    business_id = get_effective_business_id(current_user)
    conv_result = await db.execute(
        select(Conversation)
        .options(joinedload(Conversation.channel), joinedload(Conversation.contact))
        .where(
            Conversation.id == conversation_id,
            Conversation.business_id == business_id,
            *((Conversation.assigned_to_id == current_user.id,) if current_user.role == "employee" else ()),
        )
    )
    conversation = conv_result.unique().scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def send_platform_message(
    conversation: Conversation,
    content: str,
    attachment: dict | None = None,
) -> str | None:
    if conversation.platform == "facebook":
        if attachment:
            return await send_facebook_attachment(
                page_access_token=conversation.channel.access_token,
                recipient_id=conversation.contact.platform_user_id,
                attachment_url=attachment["attachment_url"],
                attachment_kind=attachment["attachment_kind"],
            )
        return await send_facebook_message(
            page_access_token=conversation.channel.access_token,
            recipient_id=conversation.contact.platform_user_id,
            message_text=content,
        )
    if conversation.platform == "instagram":
        if attachment:
            return await send_instagram_attachment(
                page_access_token=conversation.channel.access_token,
                recipient_id=conversation.contact.platform_user_id,
                attachment_url=attachment["attachment_url"],
                attachment_kind=attachment["attachment_kind"],
            )
        return await send_instagram_message(
            page_access_token=conversation.channel.access_token,
            recipient_id=conversation.contact.platform_user_id,
            message_text=content,
        )
    if conversation.platform == "telegram":
        if attachment:
            return await send_telegram_attachment(
                bot_token=conversation.channel.access_token,
                chat_id=conversation.contact.platform_user_id,
                attachment_url=attachment["attachment_url"],
                caption=content if content != attachment["attachment_filename"] else None,
            )
        return await send_telegram_message(
            bot_token=conversation.channel.access_token,
            chat_id=conversation.contact.platform_user_id,
            message_text=content,
        )
    return None


async def notify_message(conversation: Conversation, message: Message) -> None:
    payload = serialize_message(message)
    await manager.send_message(
        str(conversation.business_id),
        {
            "type": "new_message",
            "conversation_id": str(conversation.id),
            "message": payload,
        },
    )

    if conversation.platform == "widget" and conversation.channel and conversation.channel.widget_id:
        await manager.send_message(
            f"widget:{conversation.channel.widget_id}",
            {
                "type": "new_message",
                "message": payload,
            },
        )


@router.get("/{conversation_id}/messages", response_model=MessagePageOut)
async def get_messages(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    before: uuid.UUID | None = Query(None),
):
    business_id = get_effective_business_id(current_user)
    # Verify conversation belongs to this business
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.business_id == business_id,
            *((Conversation.assigned_to_id == current_user.id,) if current_user.role == "employee" else ()),
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    filters = [Message.conversation_id == conversation_id]
    if before:
        cursor_result = await db.execute(
            select(Message).where(Message.id == before, Message.conversation_id == conversation_id)
        )
        cursor_message = cursor_result.scalar_one_or_none()
        if not cursor_message:
            raise HTTPException(status_code=400, detail="Invalid message cursor")

        filters.append(
            or_(
                Message.created_at < cursor_message.created_at,
                and_(Message.created_at == cursor_message.created_at, Message.id < cursor_message.id),
            )
        )

    result = await db.execute(
        select(Message)
        .where(*filters)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit + 1)
    )
    messages_desc = result.scalars().all()
    has_more = len(messages_desc) > limit
    page_desc = messages_desc[:limit]
    items = list(reversed(page_desc))

    return {
        "items": items,
        "has_more": has_more,
        "next_cursor": items[0].id if has_more and items else None,
    }


@router.post("/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: uuid.UUID,
    data: MessageCreate,
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_sendable_conversation(conversation_id, current_user, db)

    # Send message via platform API
    platform_message_id = None
    try:
        platform_message_id = await send_platform_message(conversation, data.content)
    except Exception as e:
        logger.warning(
            "Failed to send %s message for conversation %s via channel %s: %s",
            conversation.platform,
            conversation_id,
            conversation.channel_id,
            e,
        )
        raise HTTPException(status_code=502, detail=f"Failed to send message: {str(e)}")

    # Save message to DB
    message = Message(
        conversation_id=conversation_id,
        sender_type="business",
        content=data.content,
        platform_message_id=platform_message_id,
    )
    db.add(message)
    conversation.last_message_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(message)

    await notify_message(conversation, message)

    await db.commit()
    return message


@router.post("/{conversation_id}/messages/upload", response_model=MessageOut)
async def upload_message_file(
    conversation_id: uuid.UUID,
    file: UploadFile = File(...),
    content: str = Form(""),
    current_user: User = Depends(get_current_business_or_employee),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_sendable_conversation(conversation_id, current_user, db)
    attachment = await save_upload_file(file)
    message_content = content.strip() or attachment["attachment_filename"]

    platform_message_id = None
    try:
        platform_message_id = await send_platform_message(conversation, message_content, attachment)
    except Exception as e:
        logger.warning(
            "Failed to send %s attachment for conversation %s via channel %s: %s",
            conversation.platform,
            conversation_id,
            conversation.channel_id,
            e,
        )
        raise HTTPException(status_code=502, detail=f"Failed to send message: {str(e)}")

    message = Message(
        conversation_id=conversation_id,
        sender_type="business",
        content=message_content,
        platform_message_id=platform_message_id,
        attachment_url=attachment["attachment_url"],
        attachment_filename=attachment["attachment_filename"],
        attachment_mime_type=attachment["attachment_mime_type"],
        attachment_size=attachment["attachment_size"],
        attachment_kind=attachment["attachment_kind"],
    )
    db.add(message)
    conversation.last_message_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(message)

    await notify_message(conversation, message)
    await db.commit()
    return message
