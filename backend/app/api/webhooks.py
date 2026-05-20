import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from app.config import get_settings
from app.database import async_session
from app.models.channel import Channel
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.message import Message
from app.services.assignment_service import auto_assign_conversation
from app.services.ai_service import generate_ai_response
from app.services.file_storage import save_remote_file
from app.services.telegram_service import get_telegram_file_url, get_telegram_user_profile_photo_url
from app.websocket.manager import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
settings = get_settings()


# ==================== Facebook Webhook ====================


def _verify_webhook_request(
    hub_mode: str | None,
    hub_verify_token: str | None,
    hub_challenge: str | None,
):
    if hub_mode == "subscribe" and hub_verify_token == settings.FB_VERIFY_TOKEN:
        return PlainTextResponse(content=hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.get("/facebook")
async def facebook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Facebook webhook verification (GET)."""
    return _verify_webhook_request(hub_mode, hub_verify_token, hub_challenge)


@router.post("/facebook")
async def facebook_webhook(request: Request):
    """Receive Meta webhooks on the legacy Facebook callback URL."""
    body = await request.json()
    logger.info("Meta webhook received on /facebook: object=%s body=%s", body.get("object"), body)
    return await _handle_meta_webhook_body(body)


# ==================== Instagram Webhook ====================


@router.get("/instagram")
async def instagram_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Instagram webhook verification (GET)."""
    return _verify_webhook_request(hub_mode, hub_verify_token, hub_challenge)


@router.post("/instagram")
async def instagram_webhook(request: Request):
    """Receive Meta webhooks on the Instagram callback URL."""
    body = await request.json()
    logger.info("Meta webhook received on /instagram: object=%s body=%s", body.get("object"), body)
    return await _handle_meta_webhook_body(body)


@router.get("/meta")
async def meta_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Unified Meta webhook verification (GET)."""
    return _verify_webhook_request(hub_mode, hub_verify_token, hub_challenge)


@router.post("/meta")
async def meta_webhook(request: Request):
    """Receive Facebook and Instagram webhooks on one callback URL."""
    body = await request.json()
    logger.info("Meta webhook received on /meta: object=%s body=%s", body.get("object"), body)
    return await _handle_meta_webhook_body(body)


async def _handle_meta_webhook_body(body: dict):
    meta_object = body.get("object")
    if meta_object == "page":
        return await _process_messaging_entries(body, platform="facebook")
    if meta_object == "instagram":
        return await _process_messaging_entries(body, platform="instagram")

    logger.info("Ignored unsupported Meta webhook object=%s", meta_object)
    return {"status": "ignored"}


async def _process_messaging_entries(body: dict, platform: str):
    for entry in body.get("entry", []):
        channel_platform_id = entry.get("id")
        for messaging_event in entry.get("messaging", []):
            sender_id = messaging_event.get("sender", {}).get("id")
            message_data = messaging_event.get("message", {})
            message_text = message_data.get("text")
            attachment = await _meta_attachment(message_data)

            if (not message_text and not attachment) or sender_id == channel_platform_id:
                continue

            await _process_incoming_message(
                platform=platform,
                page_id=channel_platform_id,
                sender_id=sender_id,
                message_text=message_text or attachment.get("attachment_filename") or "Attachment",
                platform_message_id=message_data.get("mid"),
                attachment=attachment,
            )

    return {"status": "ok"}


# ==================== Telegram Webhook ====================

@router.post("/telegram/{bot_id}")
async def telegram_webhook(bot_id: str, request: Request):
    """Receive messages from Telegram Bot API.
    
    bot_id is the numeric part of the bot token (before the colon),
    used to identify which channel this webhook belongs to.
    """
    body = await request.json()
    logger.info(f"Telegram webhook received for bot {bot_id}: {body}")

    message_data = body.get("message")
    if not message_data:
        return {"status": "ignored"}

    text = message_data.get("text", "") or message_data.get("caption", "")
    attachment = await _telegram_attachment(message_data, bot_id)
    if (not text and not attachment) or text.startswith("/start"):
        return {"status": "ignored"}

    chat = message_data.get("chat", {})
    from_user = message_data.get("from", {})
    chat_id = str(chat.get("id"))
    sender_id = str(from_user.get("id"))

    # Build display name from Telegram user info
    first_name = from_user.get("first_name", "")
    last_name = from_user.get("last_name", "")
    sender_name = f"{first_name} {last_name}".strip() or from_user.get("username") or f"User {sender_id[-6:]}"

    await _process_incoming_message(
        platform="telegram",
        page_id=bot_id,
        sender_id=chat_id,  # Use chat_id as recipient for replies
        message_text=text or attachment.get("attachment_filename") or "Attachment",
        platform_message_id=str(message_data.get("message_id", "")),
        sender_name=sender_name,
        sender_profile_id=sender_id,
        attachment=attachment,
    )

    return {"status": "ok"}


# ==================== Shared Logic ====================

async def _process_incoming_message(
    platform: str,
    page_id: str,
    sender_id: str,
    message_text: str,
    platform_message_id: str | None,
    sender_name: str | None = None,
    sender_profile_id: str | None = None,
    attachment: dict | None = None,
):
    """Process incoming message from FB or IG: save to DB, trigger AI, notify via WS."""
    async with async_session() as db:
        try:
            # 1. Find channel
            channel_result = await db.execute(
                select(Channel).where(
                    Channel.platform == platform,
                    Channel.platform_page_id == page_id,
                    Channel.is_active == True,
                )
            )
            channel = channel_result.scalar_one_or_none()
            if not channel:
                logger.warning(f"No active channel for {platform} page {page_id}")
                return

            # 2. Find or create contact
            sender_profile = None
            contact_result = await db.execute(
                select(Contact).where(
                    Contact.business_id == channel.business_id,
                    Contact.platform == platform,
                    Contact.platform_user_id == sender_id,
                )
            )
            contact = contact_result.scalar_one_or_none()
            if not contact:
                sender_profile = await _get_sender_profile(
                    platform,
                    channel.access_token,
                    sender_profile_id or sender_id,
                )
                contact = Contact(
                    business_id=channel.business_id,
                    platform=platform,
                    platform_user_id=sender_id,
                    display_name=(
                        sender_name
                        or _profile_display_name(sender_profile)
                        or f"User {sender_id[-6:]}"
                    ),
                    profile_pic_url=_profile_pic_url(sender_profile),
                )
                db.add(contact)
                await db.flush()
                await db.refresh(contact)
            elif not contact.profile_pic_url or not contact.display_name or contact.display_name.startswith("User "):
                sender_profile = await _get_sender_profile(
                    platform,
                    channel.access_token,
                    sender_profile_id or sender_id,
                )
                if sender_profile:
                    contact.display_name = (
                        sender_name
                        or _profile_display_name(sender_profile)
                        or contact.display_name
                    )
                    contact.profile_pic_url = _profile_pic_url(sender_profile) or contact.profile_pic_url

            # 3. Find or create conversation
            conv_result = await db.execute(
                select(Conversation).where(
                    Conversation.channel_id == channel.id,
                    Conversation.contact_id == contact.id,
                )
            )
            conversation = conv_result.scalar_one_or_none()
            if not conversation:
                conversation = Conversation(
                    business_id=channel.business_id,
                    channel_id=channel.id,
                    contact_id=contact.id,
                    platform=platform,
                    is_ai_enabled=True,
                )
                db.add(conversation)
                await db.flush()
                await db.refresh(conversation)
                await auto_assign_conversation(
                    db=db,
                    conversation=conversation,
                    business_id=channel.business_id,
                    platform=platform,
                    contact_id=contact.id,
                )

            # 4. Save incoming message
            message = Message(
                conversation_id=conversation.id,
                sender_type="contact",
                content=message_text,
                platform_message_id=platform_message_id,
                attachment_url=attachment.get("attachment_url") if attachment else None,
                attachment_filename=attachment.get("attachment_filename") if attachment else None,
                attachment_mime_type=attachment.get("attachment_mime_type") if attachment else None,
                attachment_size=attachment.get("attachment_size") if attachment else None,
                attachment_kind=attachment.get("attachment_kind") if attachment else None,
            )
            db.add(message)
            conversation.last_message_at = datetime.now(timezone.utc)
            await db.flush()
            await db.refresh(message)
            await db.commit()

            # 5. Notify frontend via WebSocket after commit so refetches see
            # the updated contact profile and message.
            await manager.send_message(
                str(channel.business_id),
                {
                    "type": "new_message",
                    "conversation_id": str(conversation.id),
                    "message": _message_payload(message),
                    "contact": {
                        "id": str(contact.id),
                        "display_name": contact.display_name,
                        "profile_pic_url": contact.profile_pic_url,
                        "platform": contact.platform,
                    },
                },
            )

            # 6. If AI enabled, generate and send AI response
            if conversation.is_ai_enabled and not attachment:
                logger.info(f"Generating AI response for {platform} conversation {conversation.id}")
                ai_response_text = await generate_ai_response(
                    db=db,
                    conversation=conversation,
                    user_message=message_text,
                )
                logger.info(f"AI response: {ai_response_text[:100] if ai_response_text else 'None'}")

                if ai_response_text:
                    # Send AI reply back via platform
                    from app.services.facebook_service import send_facebook_message
                    from app.services.instagram_service import send_instagram_message
                    from app.services.telegram_service import send_telegram_message

                    ai_platform_msg_id = None
                    try:
                        if platform == "facebook":
                            ai_platform_msg_id = await send_facebook_message(
                                page_access_token=channel.access_token,
                                recipient_id=sender_id,
                                message_text=ai_response_text,
                            )
                        elif platform == "instagram":
                            ai_platform_msg_id = await send_instagram_message(
                                page_access_token=channel.access_token,
                                recipient_id=sender_id,
                                message_text=ai_response_text,
                            )
                        elif platform == "telegram":
                            ai_platform_msg_id = await send_telegram_message(
                                bot_token=channel.access_token,
                                chat_id=sender_id,
                                message_text=ai_response_text,
                            )
                    except Exception as e:
                        logger.error(f"Failed to send AI response via {platform}: {e}")

                    # Save AI message
                    ai_message = Message(
                        conversation_id=conversation.id,
                        sender_type="ai",
                        content=ai_response_text,
                        platform_message_id=ai_platform_msg_id,
                    )
                    db.add(ai_message)
                    conversation.last_message_at = datetime.now(timezone.utc)
                    await db.flush()
                    await db.refresh(ai_message)
                    await db.commit()

                    # Notify frontend after the AI message is committed.
                    await manager.send_message(
                        str(channel.business_id),
                        {
                            "type": "new_message",
                            "conversation_id": str(conversation.id),
                            "message": _message_payload(ai_message),
                        },
                    )

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Error processing incoming message: {e}", exc_info=True)


async def _get_sender_profile(
    platform: str,
    page_access_token: str,
    sender_id: str,
) -> dict | None:
    try:
        if platform == "facebook":
            from app.services.facebook_service import get_facebook_user_profile

            return await get_facebook_user_profile(page_access_token, sender_id)
        if platform == "instagram":
            from app.services.instagram_service import get_instagram_user_profile

            return await get_instagram_user_profile(page_access_token, sender_id)
        if platform == "telegram":
            profile_pic_url = await get_telegram_user_profile_photo_url(page_access_token, sender_id)
            if not profile_pic_url:
                return None

            saved_photo = await save_remote_file(
                profile_pic_url,
                filename=f"telegram-profile-{sender_id}.jpg",
                mime_type="image/jpeg",
            )
            if not saved_photo:
                return None

            return {"profile_pic_url": saved_photo["attachment_url"]}
    except Exception as e:
        logger.warning("Failed to fetch %s sender profile for %s: %s", platform, sender_id, e)
    return None


def _profile_display_name(profile: dict | None) -> str | None:
    if not profile:
        return None

    name = profile.get("name")
    if name:
        return name

    first_name = profile.get("first_name")
    last_name = profile.get("last_name")
    full_name = " ".join(part for part in [first_name, last_name] if part).strip()
    if full_name:
        return full_name

    return profile.get("username")


def _profile_pic_url(profile: dict | None) -> str | None:
    if not profile:
        return None
    return profile.get("profile_pic") or profile.get("profile_picture_url")


def _message_payload(message: Message) -> dict:
    return {
        "id": str(message.id),
        "conversation_id": str(message.conversation_id),
        "sender_type": message.sender_type,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
        "attachment_url": message.attachment_url,
        "attachment_filename": message.attachment_filename,
        "attachment_mime_type": message.attachment_mime_type,
        "attachment_size": message.attachment_size,
        "attachment_kind": message.attachment_kind,
    }


async def _meta_attachment(message_data: dict) -> dict | None:
    attachments = message_data.get("attachments") or []
    if not attachments:
        return None

    item = attachments[0]
    payload = item.get("payload") or {}
    url = payload.get("url")
    if not url:
        return None

    kind = item.get("type") or "file"
    saved_file = await save_remote_file(
        url,
        filename=payload.get("name") or f"{kind}-attachment",
    )
    if saved_file:
        saved_file["attachment_kind"] = kind if kind in {"image", "video", "audio", "file"} else "file"
        return saved_file

    return {
        "attachment_url": url,
        "attachment_filename": payload.get("name") or f"{kind}-attachment",
        "attachment_mime_type": None,
        "attachment_size": None,
        "attachment_kind": kind if kind in {"image", "video", "audio", "file"} else "file",
    }


async def _telegram_attachment(message_data: dict, bot_id: str) -> dict | None:
    file_info = None
    kind = "file"

    if message_data.get("document"):
        document = message_data["document"]
        file_info = document
        kind = "file"
    elif message_data.get("photo"):
        photos = message_data["photo"]
        file_info = photos[-1] if photos else None
        kind = "image"
    elif message_data.get("video"):
        file_info = message_data["video"]
        kind = "video"
    elif message_data.get("audio"):
        file_info = message_data["audio"]
        kind = "audio"

    if not file_info:
        return None

    channel_result = None
    async with async_session() as db:
        channel_result = await db.execute(
            select(Channel).where(Channel.platform == "telegram", Channel.platform_page_id == bot_id)
        )
        channel = channel_result.scalar_one_or_none()
        if not channel:
            return None
        file_url = await get_telegram_file_url(channel.access_token, file_info.get("file_id"))

    if not file_url:
        return None

    saved_file = await save_remote_file(
        file_url,
        filename=file_info.get("file_name") or f"{kind}-attachment",
        mime_type=file_info.get("mime_type"),
    )
    if not saved_file:
        return None

    saved_file["attachment_kind"] = kind
    return saved_file
