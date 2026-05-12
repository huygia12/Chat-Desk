import secrets
import json
import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.channel import Channel

logger = logging.getLogger(__name__)


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
    result = await db.execute(
        select(Channel).where(
            Channel.widget_id == widget_id,
            Channel.is_active == True,
        )
    )
    channel = result.scalar_one_or_none()

    if not channel:
        logger.warning(f"[Widget] Validation FAILED: widget_id='{widget_id}' not found or inactive")
        return None

    if channel.widget_secret != widget_secret:
        logger.warning(
            f"[Widget] Validation FAILED: secret mismatch for widget_id='{widget_id}' "
            f"(received len={len(widget_secret)}, expected len={len(channel.widget_secret)})"
        )
        return None

    # Check origin whitelist (skip check for internal calls using "*")
    if origin != "*" and channel.allowed_origins:
        try:
            allowed_origins_list = json.loads(channel.allowed_origins)
            # "*" in the list means allow all origins
            if "*" not in allowed_origins_list and origin not in allowed_origins_list:
                logger.warning(
                    f"[Widget] Validation FAILED: origin='{origin}' not in "
                    f"allowed_origins={allowed_origins_list} for widget_id='{widget_id}'"
                )
                return None
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"[Widget] Validation FAILED: cannot parse allowed_origins='{channel.allowed_origins}'")
            return None

    logger.info(f"[Widget] Validation OK: widget_id='{widget_id}', origin='{origin}'")
    return channel
