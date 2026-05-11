import secrets
import json
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.channel import Channel


async def generate_widget_id() -> str:
    """Generate unique widget ID."""
    return secrets.token_urlsafe(16)


async def generate_widget_secret() -> str:
    """Generate widget API secret."""
    return secrets.token_urlsafe(32)


async def validate_widget_request(
    widget_id: str,
    widget_secret: str,
    origin: str,
    db: AsyncSession,
) -> Optional[Channel]:
    """
    Validate incoming widget request.
    
    Args:
        widget_id: Widget ID from request header
        widget_secret: Widget secret from request header
        origin: Origin from request header
        db: Database session
        
    Returns:
        Channel object if valid, None otherwise
    """
    result = await db.execute(
        select(Channel).where(
            Channel.widget_id == widget_id,
            Channel.is_active == True,
        )
    )
    channel = result.scalar_one_or_none()

    if not channel or channel.widget_secret != widget_secret:
        return None

    # Check origin whitelist (skip check for internal calls using "*")
    if origin != "*" and channel.allowed_origins:
        try:
            allowed_origins_list = json.loads(channel.allowed_origins)
            if origin not in allowed_origins_list:
                return None
        except (json.JSONDecodeError, TypeError):
            return None

    return channel
