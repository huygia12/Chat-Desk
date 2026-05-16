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
from app.services.ai_service import generate_ai_response
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

            if not message_text or sender_id == channel_platform_id:
                continue

            await _process_incoming_message(
                platform=platform,
                page_id=channel_platform_id,
                sender_id=sender_id,
                message_text=message_text,
                platform_message_id=message_data.get("mid"),
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

    # Only process text messages
    text = message_data.get("text", "")
    if not text or text.startswith("/start"):
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
        message_text=text,
        platform_message_id=str(message_data.get("message_id", "")),
        sender_name=sender_name,
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
            contact_result = await db.execute(
                select(Contact).where(
                    Contact.business_id == channel.business_id,
                    Contact.platform == platform,
                    Contact.platform_user_id == sender_id,
                )
            )
            contact = contact_result.scalar_one_or_none()
            if not contact:
                contact = Contact(
                    business_id=channel.business_id,
                    platform=platform,
                    platform_user_id=sender_id,
                    display_name=sender_name or f"User {sender_id[-6:]}",
                )
                db.add(contact)
                await db.flush()
                await db.refresh(contact)

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

            # 4. Save incoming message
            message = Message(
                conversation_id=conversation.id,
                sender_type="contact",
                content=message_text,
                platform_message_id=platform_message_id,
            )
            db.add(message)
            conversation.last_message_at = datetime.now(timezone.utc)
            await db.flush()
            await db.refresh(message)

            # 5. Notify frontend via WebSocket
            await manager.send_message(
                str(channel.business_id),
                {
                    "type": "new_message",
                    "conversation_id": str(conversation.id),
                    "message": {
                        "id": str(message.id),
                        "sender_type": message.sender_type,
                        "content": message.content,
                        "created_at": message.created_at.isoformat(),
                    },
                    "contact": {
                        "id": str(contact.id),
                        "display_name": contact.display_name,
                        "platform": contact.platform,
                    },
                },
            )

            # 6. If AI enabled, generate and send AI response
            if conversation.is_ai_enabled:
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

                    # Notify frontend
                    await manager.send_message(
                        str(channel.business_id),
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

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Error processing incoming message: {e}", exc_info=True)
