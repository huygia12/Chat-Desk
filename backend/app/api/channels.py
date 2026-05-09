import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.models.channel import Channel
from app.schemas.channel import ChannelCreate, ChannelOut
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
        select(Channel).where(Channel.business_id == current_user.id).order_by(Channel.created_at.desc())
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
        
        # Save all pages
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
            
            if not existing:
                channel = Channel(
                    business_id=uuid.UUID(business_id),
                    platform="facebook",
                    platform_page_id=page["id"],
                    page_name=page["name"],
                    access_token=page["access_token"],
                )
                db.add(channel)
                
                # Subscribe to webhook
                await subscribe_page_webhook(page["id"], page["access_token"])
                
                # Try to get Instagram accounts
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
                    if not ig_existing:
                        ig_channel = Channel(
                            business_id=uuid.UUID(business_id),
                            platform="instagram",
                            platform_page_id=ig["id"],
                            page_name=ig.get("username") or ig.get("name"),
                            access_token=page["access_token"],  # Use page token for IG
                        )
                        db.add(ig_channel)
        
        await db.commit()
        logger.info(f"Successfully connected {len(pages)} page(s) for business {business_id}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/channels?success=true")
        
    except Exception as e:
        await db.rollback()
        logger.error(f"OAuth callback error for business {business_id}: {e}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/channels?error={str(e)}")


@router.post("/facebook", response_model=ChannelOut)
async def connect_facebook(
    data: ChannelCreate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    # Check if page already connected
    result = await db.execute(
        select(Channel).where(
            Channel.business_id == current_user.id,
            Channel.platform == "facebook",
            Channel.platform_page_id == data.platform_page_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="This Facebook Page is already connected")

    channel = Channel(
        business_id=current_user.id,
        platform="facebook",
        platform_page_id=data.platform_page_id,
        page_name=data.page_name,
        access_token=data.access_token,
    )
    db.add(channel)
    await db.flush()
    await db.refresh(channel)
    return channel


@router.post("/instagram", response_model=ChannelOut)
async def connect_instagram(
    data: ChannelCreate,
    current_user: User = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Channel).where(
            Channel.business_id == current_user.id,
            Channel.platform == "instagram",
            Channel.platform_page_id == data.platform_page_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="This Instagram account is already connected")

    channel = Channel(
        business_id=current_user.id,
        platform="instagram",
        platform_page_id=data.platform_page_id,
        page_name=data.page_name,
        access_token=data.access_token,
    )
    db.add(channel)
    await db.flush()
    await db.refresh(channel)
    return channel


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
    return {"detail": "Channel disconnected"}


# ==================== Telegram ====================

class TelegramConnect(ChannelCreate):
    """Only bot_token is required for Telegram."""
    pass


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
