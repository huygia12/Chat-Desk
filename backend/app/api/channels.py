import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError
from app.config import get_settings
from app.database import get_db
from app.i18n import t
from app.models.user import User
from app.models.channel import Channel
from app.schemas.channel import ChannelOut, TelegramConnect
from app.api.deps import get_current_business
from app.services.oauth_service import (
    get_facebook_oauth_url,
    exchange_code_for_token,
    get_user_pages,
    subscribe_page_webhook,
    get_instagram_accounts,
)
from app.services.telegram_service import (
    get_telegram_bot_info,
    set_telegram_webhook,
    delete_telegram_webhook,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/channels", tags=["channels"])

settings = get_settings()


def _apply_channel_updates(
    channel: Channel,
    page_name: str | None,
    access_token: str,
) -> None:
    """Refresh credentials when a user reconnects the same Meta asset."""
    channel.page_name = page_name or channel.page_name
    channel.access_token = access_token
    channel.is_active = True


def _encode_oauth_state(business_id: str) -> str:
    """Encode business_id into a signed JWT token used as OAuth state."""
    return jwt.encode({"bid": business_id}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode_oauth_state(state: str) -> str | None:
    """Decode business_id from OAuth state token. Returns None if invalid."""
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("bid")
    except JWTError:
        return None


@router.get("", response_model=list[ChannelOut])
async def list_channels(
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Channel)
        .where(
            Channel.business_id == current_user.id,
            Channel.platform != "widget",
        )
        .order_by(Channel.created_at.desc())
    )
    return result.scalars().all()


@router.get("/facebook/oauth")
async def facebook_oauth_start(current_user: User = Depends(get_current_business)):
    """Start Facebook OAuth flow. Returns the OAuth URL as JSON."""
    state = _encode_oauth_state(str(current_user.id))
    oauth_url = get_facebook_oauth_url(state)
    return {"url": oauth_url}


@router.get("/facebook/callback")
async def facebook_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle Facebook OAuth callback."""
    # Decode business_id from signed state token
    business_id = _decode_oauth_state(state)
    if not business_id:
        logger.error("Invalid OAuth state token")
        return RedirectResponse(f"{settings.FRONTEND_URL}/channels?error=invalid_state")

    try:
        # Exchange code for token
        user_access_token = await exchange_code_for_token(code)
        
        # Get user's pages
        pages = await get_user_pages(user_access_token)
        
        if not pages:
            logger.warning(f"No pages found for business {business_id}")
            return RedirectResponse(f"{settings.FRONTEND_URL}/channels?error=no_pages")
        
        connected_pages = 0
        connected_instagram_accounts = 0

        # Save all pages and their linked Instagram professional accounts.
        for page in pages:
            # Check if already exists
            result = await db.execute(
                select(Channel).where(
                    Channel.business_id == uuid.UUID(business_id),
                    Channel.platform == "facebook",
                    Channel.platform_page_id == page["id"],
                )
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                _apply_channel_updates(existing, page.get("name"), page["access_token"])
            else:
                channel = Channel(
                    business_id=uuid.UUID(business_id),
                    platform="facebook",
                    platform_page_id=page["id"],
                    page_name=page["name"],
                    access_token=page["access_token"],
                )
                db.add(channel)
            connected_pages += 1

            # Subscribe the Facebook Page. Instagram messaging webhooks for a
            # linked professional account also depend on the Meta app webhook
            # subscription configured in the developer dashboard.
            await subscribe_page_webhook(page["id"], page["access_token"])

            # Try to get Instagram accounts linked to this Page.
            ig_accounts = await get_instagram_accounts(page["id"], page["access_token"])
            for ig in ig_accounts:
                ig_result = await db.execute(
                    select(Channel).where(
                        Channel.business_id == uuid.UUID(business_id),
                        Channel.platform == "instagram",
                        Channel.platform_page_id == ig["id"],
                    )
                )
                ig_existing = ig_result.scalar_one_or_none()
                ig_name = ig.get("username") or ig.get("name") or f"Instagram {ig['id']}"
                if ig_existing:
                    _apply_channel_updates(ig_existing, ig_name, page["access_token"])
                else:
                    ig_channel = Channel(
                        business_id=uuid.UUID(business_id),
                        platform="instagram",
                        platform_page_id=ig["id"],
                        page_name=ig_name,
                        access_token=page["access_token"],  # Use linked Page token for IG messaging.
                    )
                    db.add(ig_channel)
                connected_instagram_accounts += 1
        
        await db.commit()
        logger.info(
            "Successfully connected Meta assets for business %s: %s Facebook page(s), %s Instagram account(s)",
            business_id,
            connected_pages,
            connected_instagram_accounts,
        )
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/channels?success=meta"
            f"&pages={connected_pages}&instagram={connected_instagram_accounts}"
        )
        
    except Exception as e:
        await db.rollback()
        logger.error(f"OAuth callback error for business {business_id}: {e}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/channels?error={str(e)}")


@router.delete("/{channel_id}")
async def disconnect_channel(
    channel_id: uuid.UUID,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.business_id == current_user.id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Clean up Telegram webhook when disconnecting
    if channel.platform == "telegram":
        await delete_telegram_webhook(channel.access_token)

    await db.delete(channel)
    return {"detail": t("Channel disconnected")}


@router.post("/telegram/connect", response_model=ChannelOut)
async def connect_telegram(
    data: TelegramConnect,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Connect a Telegram Bot. Validates bot token & sets webhook."""
    bot_token = data.access_token.strip()
    
    # Validate bot token by calling getMe
    bot_info = await get_telegram_bot_info(bot_token)
    if not bot_info:
        raise HTTPException(status_code=400, detail="Bot token không hợp lệ. Kiểm tra lại token từ @BotFather.")
    
    bot_id = str(bot_info["id"])
    bot_username = bot_info.get("username", "")
    bot_name = bot_info.get("first_name", bot_username)
    
    # Check if already connected
    result = await db.execute(
        select(Channel).where(
            Channel.business_id == current_user.id,
            Channel.platform == "telegram",
            Channel.platform_page_id == bot_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"Bot @{bot_username} đã được kết nối rồi.")
    
    # Set webhook URL
    base_url = settings.FB_OAUTH_REDIRECT_URI.rsplit("/api/", 1)[0]  # Get base URL from existing config
    webhook_url = f"{base_url}/api/webhooks/telegram/{bot_id}"
    
    success = await set_telegram_webhook(bot_token, webhook_url)
    if not success:
        raise HTTPException(status_code=500, detail="Không thể đăng ký webhook với Telegram. Thử lại sau.")
    
    # Save channel
    channel = Channel(
        business_id=current_user.id,
        platform="telegram",
        platform_page_id=bot_id,
        page_name=f"@{bot_username}" if bot_username else bot_name,
        access_token=bot_token,
    )
    db.add(channel)
    await db.flush()
    await db.refresh(channel)
    
    logger.info(f"Telegram bot @{bot_username} (ID: {bot_id}) connected for business {current_user.id}, webhook: {webhook_url}")
    return channel
