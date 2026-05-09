import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.message import MessageCreate, MessageOut
from app.api.deps import get_current_business
from app.services.facebook_service import send_facebook_message
from app.services.instagram_service import send_instagram_message
from app.services.telegram_service import send_telegram_message

router = APIRouter(prefix="/api/conversations", tags=["messages"])


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    # Verify conversation belongs to this business
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.business_id == current_user.id,
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: uuid.UUID,
    data: MessageCreate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import joinedload

    # Get conversation with channel and contact
    conv_result = await db.execute(
        select(Conversation)
        .options(joinedload(Conversation.channel), joinedload(Conversation.contact))
        .where(
            Conversation.id == conversation_id,
            Conversation.business_id == current_user.id,
        )
    )
    conversation = conv_result.unique().scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Send message via platform API
    platform_message_id = None
    try:
        if conversation.platform == "facebook":
            platform_message_id = await send_facebook_message(
                page_access_token=conversation.channel.access_token,
                recipient_id=conversation.contact.platform_user_id,
                message_text=data.content,
            )
        elif conversation.platform == "instagram":
            platform_message_id = await send_instagram_message(
                page_access_token=conversation.channel.access_token,
                recipient_id=conversation.contact.platform_user_id,
                message_text=data.content,
            )
        elif conversation.platform == "telegram":
            platform_message_id = await send_telegram_message(
                bot_token=conversation.channel.access_token,
                chat_id=conversation.contact.platform_user_id,
                message_text=data.content,
            )
    except Exception as e:
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

    return message
