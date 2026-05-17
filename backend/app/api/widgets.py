import json
import logging
import uuid
from html.parser import HTMLParser
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urljoin, urlparse

import httpx
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


@router.get("/{widget_id}/history")
async def get_widget_history(
    widget_id: str,
    widget_secret: str,
    visitor_id: str,
    visitor_email: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint for the widget iframe to restore conversation history on reload.
    Lookup is based on visitor_id (from localStorage), NOT email.
    Returns empty list if no conversation exists for this visitor_id.
    """
    # Validate widget credentials (skip origin check — internal call)
    channel = await validate_widget_request(widget_id, widget_secret, "*", db)
    if not channel:
        raise HTTPException(status_code=401, detail="Invalid widget credentials")

    contact = await _find_widget_contact(
        db=db,
        business_id=channel.business_id,
        visitor_id=visitor_id,
        visitor_email=visitor_email,
    )

    if not contact:
        return {"conversation_id": None, "messages": []}

    # Find conversation for this contact + channel
    conv_result = await db.execute(
        select(Conversation)
        .where(
            Conversation.channel_id == channel.id,
            Conversation.contact_id == contact.id,
        )
        .order_by(Conversation.created_at.asc(), Conversation.id.asc())
        .limit(1)
    )
    conversation = conv_result.scalar_one_or_none()

    if not conversation:
        return {"conversation_id": None, "messages": []}

    # Fetch messages ordered by created_at
    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc())
    )
    msgs = msg_result.scalars().all()

    return {
        "conversation_id": str(conversation.id),
        "messages": [
            {
                "id": str(m.id),
                "sender_type": m.sender_type,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs
        ],
    }


@router.get("/{widget_id}/messages")
async def get_widget_messages(
    widget_id: str,
    widget_secret: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint for the widget iframe to fetch conversation history."""
    # Validate widget credentials
    channel = await validate_widget_request(widget_id, widget_secret, "*", db)
    if not channel:
        raise HTTPException(status_code=401, detail="Invalid widget credentials")

    # Validate conversation belongs to this widget's channel
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.channel_id == channel.id,
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    msgs = msg_result.scalars().all()
    return [
        {
            "id": str(m.id),
            "sender_type": m.sender_type,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


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
    x_widget_origin: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint to receive messages from embedded widget (no auth required).

    Authentication is done solely via widget_id + widget_secret (crypto token).
    Origin check is intentionally skipped here because the request originates from
    within an iframe (frontend origin) rather than the customer's site origin.
    """

    logger.info(f"[Widget /send] widget_id='{widget_id}' secret_len={len(widget_secret)}")

    # Validate widget — pass "*" to skip origin check (secret alone is sufficient)
    channel = await validate_widget_request(widget_id, widget_secret, "*", db)
    if not channel:
        raise HTTPException(status_code=401, detail="Invalid widget credentials")

    if not body.message_text.strip():
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    business_id = channel.business_id
    widget_profile_pic_url = await _favicon_url_from_origin(
        x_widget_origin,
        channel.allowed_origins,
    )

    # Find or create contact. In CRM-style dedupe, email is a stronger
    # visitor identity than a browser-local visitor_id.
    contact = await _find_widget_contact(
        db=db,
        business_id=business_id,
        visitor_id=body.visitor_id,
        visitor_email=body.visitor_email,
    )

    if not contact:
        contact = Contact(
            business_id=business_id,
            platform="widget",
            platform_user_id=body.visitor_id,
            display_name=body.visitor_name,
            profile_pic_url=widget_profile_pic_url,
            visitor_email=body.visitor_email,
            visitor_phone=body.visitor_phone,
        )
        db.add(contact)
        await db.flush()
    else:
        _apply_widget_contact_updates(
            contact=contact,
            visitor_name=body.visitor_name,
            visitor_email=body.visitor_email,
            visitor_phone=body.visitor_phone,
            profile_pic_url=widget_profile_pic_url,
        )

    # Find or create conversation
    conv_result = await db.execute(
        select(Conversation)
        .where(
            Conversation.business_id == business_id,
            Conversation.channel_id == channel.id,
            Conversation.contact_id == contact.id,
            Conversation.platform == "widget",
        )
        .order_by(Conversation.created_at.asc(), Conversation.id.asc())
        .limit(1)
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
                "profile_pic_url": contact.profile_pic_url,
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


async def _find_widget_contact(
    db: AsyncSession,
    business_id,
    visitor_id: str,
    visitor_email: str | None,
) -> Contact | None:
    visitor_id = visitor_id.strip()
    email = _normalize_email(visitor_email)

    result = await db.execute(
        select(Contact).where(
            Contact.business_id == business_id,
            Contact.platform == "widget",
            Contact.platform_user_id == visitor_id,
        )
    )
    contact = result.scalar_one_or_none()
    if contact or not email:
        return contact

    result = await db.execute(
        select(Contact)
        .where(
            Contact.business_id == business_id,
            Contact.platform == "widget",
            Contact.visitor_email == email,
        )
        .order_by(Contact.created_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _apply_widget_contact_updates(
    contact: Contact,
    visitor_name: str,
    visitor_email: str | None,
    visitor_phone: str | None,
    profile_pic_url: str | None,
) -> None:
    if visitor_name and (not contact.display_name or contact.display_name.startswith("Visitor ")):
        contact.display_name = visitor_name

    normalized_email = _normalize_email(visitor_email)
    if normalized_email and not contact.visitor_email:
        contact.visitor_email = normalized_email

    if visitor_phone and not contact.visitor_phone:
        contact.visitor_phone = visitor_phone

    if profile_pic_url and not contact.profile_pic_url:
        contact.profile_pic_url = profile_pic_url


def _normalize_email(email: str | None) -> str | None:
    if not email:
        return None
    email = email.strip()
    return email or None


class _FaviconParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.icons: list[tuple[int, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "link":
            return

        attr_map = {key.lower(): value for key, value in attrs if key and value}
        rel = attr_map.get("rel", "").lower()
        href = attr_map.get("href")
        if not href or "icon" not in rel:
            return

        if "apple-touch-icon" in rel:
            priority = 2
        elif "shortcut icon" in rel:
            priority = 1
        else:
            priority = 0
        self.icons.append((priority, href))


async def _favicon_url_from_origin(origin: str | None, allowed_origins: str | None) -> str | None:
    if not origin or origin == "*":
        return None

    try:
        normalized_origin = _normalize_origin(origin)
        if not normalized_origin or not _is_allowed_widget_origin(normalized_origin, allowed_origins):
            return None

        html_icon = await _discover_favicon_from_html(normalized_origin)
        if html_icon:
            return html_icon

        return f"{normalized_origin}/favicon.ico"
    except Exception:
        return None


def _normalize_origin(origin: str) -> str | None:
    parsed = urlparse(origin if origin.startswith(("http://", "https://")) else f"https://{origin}")
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _is_allowed_widget_origin(origin: str, allowed_origins: str | None) -> bool:
    if not allowed_origins:
        return False

    try:
        allowed = json.loads(allowed_origins)
    except json.JSONDecodeError:
        return False

    if "*" in allowed:
        # Do not fetch arbitrary user-supplied origins when the widget is open
        # to every site. Falling back to /favicon.ico avoids SSRF-style fetches.
        return False

    normalized_allowed = {_normalize_origin(item) for item in allowed}
    return origin in normalized_allowed


async def _discover_favicon_from_html(origin: str) -> str | None:
    try:
        async with httpx.AsyncClient(
            timeout=3,
            follow_redirects=True,
            headers={"User-Agent": "ChatDesk favicon resolver"},
        ) as client:
            response = await client.get(origin)
            if response.status_code >= 400:
                return None

        parser = _FaviconParser()
        parser.feed(response.text[:200_000])
        if not parser.icons:
            return None

        _, href = sorted(parser.icons, key=lambda item: item[0])[0]
        return urljoin(str(response.url), href)
    except Exception:
        return None
