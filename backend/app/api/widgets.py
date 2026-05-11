import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db, async_session
from app.models.user import User
from app.models.channel import Channel
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.message import Message
from app.api.deps import get_current_business
from app.services.widget_service import generate_widget_id, generate_widget_secret, validate_widget_request
from app.services.ai_service import generate_ai_response
from app.websocket.manager import manager
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/widgets", tags=["widgets"])
settings = get_settings()


class CreateWidgetRequest(BaseModel):
    allowed_origins: List[str]
    widget_name: Optional[str] = None


class SendMessageRequest(BaseModel):
    visitor_id: str
    visitor_name: str
    visitor_email: Optional[str] = None
    visitor_phone: Optional[str] = None
    message_text: str


@router.get("/list")
async def list_widgets(
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """List all widgets for the current business."""
    result = await db.execute(
        select(Channel).where(
            Channel.business_id == current_user.id,
            Channel.platform == "widget",
        )
    )
    channels = result.scalars().all()
    return [
        {
            "widget_id": ch.widget_id,
            "widget_secret": ch.widget_secret,
            "page_name": ch.page_name,
            "allowed_origins": ch.allowed_origins,
            "is_active": ch.is_active,
            "created_at": ch.created_at,
        }
        for ch in channels
    ]


@router.delete("/{widget_id}")
async def delete_widget(
    widget_id: str,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Delete a widget (business owner only)."""
    result = await db.execute(
        select(Channel).where(
            Channel.widget_id == widget_id,
            Channel.business_id == current_user.id,
        )
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Widget not found")

    await db.delete(channel)
    await db.commit()
    return {"status": "deleted", "widget_id": widget_id}


@router.post("/create")
async def create_widget(
    body: CreateWidgetRequest,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Create a new widget instance for this business."""

    widget_id = await generate_widget_id()
    widget_secret = await generate_widget_secret()

    # Create widget channel
    channel = Channel(
        business_id=current_user.id,
        platform="widget",
        platform_page_id=widget_id,
        page_name=body.widget_name or "Widget",
        access_token="",  # Not used for widget
        widget_id=widget_id,
        widget_secret=widget_secret,
        allowed_origins=json.dumps(body.allowed_origins),
        is_active=True,
    )

    db.add(channel)
    await db.commit()
    await db.refresh(channel)

    logger.info(f"Widget created: {widget_id} for business {current_user.id}")

    return {
        "widget_id": widget_id,
        "widget_secret": widget_secret,
        "page_name": channel.page_name,
        "allowed_origins": channel.allowed_origins,
        "is_active": channel.is_active,
        "created_at": channel.created_at,
        "embed_script_url": f"{settings.API_URL}/static/embed.js?id={widget_id}",
    }


@router.get("/{widget_id}")
async def get_widget_config(
    widget_id: str,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Get widget configuration (for business owner only)."""

    result = await db.execute(
        select(Channel).where(
            Channel.widget_id == widget_id,
            Channel.business_id == current_user.id,
        )
    )
    channel = result.scalar_one_or_none()

    if not channel:
        raise HTTPException(status_code=404, detail="Widget not found")

    allowed_origins = []
    if channel.allowed_origins:
        try:
            allowed_origins = json.loads(channel.allowed_origins)
        except json.JSONDecodeError:
            pass

    return {
        "widget_id": widget_id,
        "widget_secret": channel.widget_secret,
        "allowed_origins": allowed_origins,
        "is_active": channel.is_active,
        "created_at": channel.created_at,
    }


@router.post("/send")
async def send_widget_message(
    body: SendMessageRequest,
    widget_id: str = Header(...),
    widget_secret: str = Header(...),
    x_widget_origin: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint to receive messages from embedded widget (no auth required)."""

    # Validate widget
    channel = await validate_widget_request(widget_id, widget_secret, x_widget_origin, db)
    if not channel:
        logger.warning(
            f"Invalid widget request: id={widget_id}, origin={x_widget_origin}"
        )
        raise HTTPException(status_code=401, detail="Invalid widget credentials")

    if not body.message_text.strip():
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    business_id = channel.business_id

    # Find or create contact
    contact_result = await db.execute(
        select(Contact).where(
            Contact.business_id == business_id,
            Contact.platform == "widget",
            Contact.platform_user_id == body.visitor_id,
        )
    )
    contact = contact_result.scalar_one_or_none()

    if not contact:
        contact = Contact(
            business_id=business_id,
            platform="widget",
            platform_user_id=body.visitor_id,
            display_name=body.visitor_name,
            profile_pic_url=None,
            visitor_email=body.visitor_email,
            visitor_phone=body.visitor_phone,
        )
        db.add(contact)
        await db.flush()

    # Find or create conversation
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.channel_id == channel.id,
            Conversation.contact_id == contact.id,
        )
    )
    conversation = conv_result.scalar_one_or_none()

    if not conversation:
        conversation = Conversation(
            business_id=business_id,
            channel_id=channel.id,
            contact_id=contact.id,
            platform="widget",
            is_ai_enabled=True,
        )
        db.add(conversation)
        await db.flush()

    # Save incoming message
    message = Message(
        conversation_id=conversation.id,
        sender_type="contact",
        content=body.message_text.strip(),
    )
    db.add(message)
    conversation.last_message_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(message)

    logger.info(f"Widget message received: conv={conversation.id}, contact={contact.display_name}")

    # Notify admin via WebSocket
    await manager.send_message(
        str(business_id),
        {
            "type": "new_message",
            "conversation_id": str(conversation.id),
            "message": {
                "id": str(message.id),
                "sender_type": "contact",
                "content": message.content,
                "created_at": message.created_at.isoformat(),
            },
            "contact": {
                "id": str(contact.id),
                "display_name": contact.display_name,
                "platform": contact.platform,
                "visitor_email": contact.visitor_email,
            },
        },
    )

    # Generate AI response
    ai_response_text = None
    if conversation.is_ai_enabled:
        try:
            ai_response_text = await generate_ai_response(
                db=db,
                conversation=conversation,
                user_message=body.message_text.strip(),
            )
            logger.info(f"AI response generated: {ai_response_text[:100] if ai_response_text else 'None'}")

            if ai_response_text:
                # Save AI message
                ai_message = Message(
                    conversation_id=conversation.id,
                    sender_type="ai",
                    content=ai_response_text,
                )
                db.add(ai_message)
                conversation.last_message_at = datetime.now(timezone.utc)
                await db.flush()
                await db.refresh(ai_message)

                # Notify admin
                await manager.send_message(
                    str(business_id),
                    {
                        "type": "new_message",
                        "conversation_id": str(conversation.id),
                        "message": {
                            "id": str(ai_message.id),
                            "sender_type": "ai",
                            "content": ai_message.content,
                            "created_at": ai_message.created_at.isoformat(),
                        },
                    },
                )
        except Exception as e:
            logger.error(f"Failed to generate AI response: {e}", exc_info=True)

    await db.commit()

    # Return response that includes AI response if generated
    response = {
        "status": "ok",
        "conversation_id": str(conversation.id),
        "message_id": str(message.id),
    }

    if ai_response_text:
        response["ai_response"] = ai_response_text

    return response
