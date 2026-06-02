import httpx
import logging

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"


async def send_telegram_message(
    bot_token: str,
    chat_id: str,
    message_text: str,
) -> str | None:
    """Send a message via Telegram Bot API. Returns message_id."""
    url = f"{TELEGRAM_API}/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message_text,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload)
        data = response.json()
        logger.info(f"Telegram sendMessage response: ok={data.get('ok')}, chat_id={chat_id}")
        if data.get("ok"):
            return str(data["result"]["message_id"])
        logger.error(f"Telegram send failed: {data}")
        return None


async def send_telegram_attachment(
    bot_token: str,
    chat_id: str,
    attachment_url: str,
    caption: str | None = None,
) -> str | None:
    """Send a file by URL via Telegram Bot API. Returns message_id."""
    url = f"{TELEGRAM_API}/bot{bot_token}/sendDocument"
    payload = {
        "chat_id": chat_id,
        "document": attachment_url,
    }
    if caption:
        payload["caption"] = caption[:1024]

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload)
        data = response.json()
        logger.info(f"Telegram sendDocument response: ok={data.get('ok')}, chat_id={chat_id}")
        if data.get("ok"):
            return str(data["result"]["message_id"])
        logger.error(f"Telegram attachment send failed: {data}")
        return None


async def get_telegram_file_url(bot_token: str, file_id: str) -> str | None:
    """Return a temporary Telegram file URL for an incoming file_id."""
    if not file_id:
        logger.warning("Telegram getFile skipped: missing file_id")
        return None

    url = f"{TELEGRAM_API}/bot{bot_token}/getFile"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params={"file_id": file_id})
            data = response.json()
            if not data.get("ok"):
                logger.warning("Telegram getFile failed: %s", data)
                return None
            file_path = data.get("result", {}).get("file_path")
            if not file_path:
                logger.warning("Telegram getFile response missing file_path: %s", data)
                return None
            return f"{TELEGRAM_API}/file/bot{bot_token}/{file_path}"
    except Exception as e:
        logger.warning("Failed to get Telegram file URL: %s", e)
        return None


async def get_telegram_user_profile_photo_url(bot_token: str, user_id: str) -> str | None:
    """Return a temporary Telegram URL for the user's largest current profile photo."""
    url = f"{TELEGRAM_API}/bot{bot_token}/getUserProfilePhotos"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params={"user_id": user_id, "limit": 1})
            data = response.json()
            if not data.get("ok"):
                logger.warning("Telegram getUserProfilePhotos failed: %s", data)
                return None

            photos = data.get("result", {}).get("photos") or []
            if not photos or not photos[0]:
                logger.info("Telegram user %s has no profile photo visible to the bot", user_id)
                return None

            largest_photo = photos[0][-1]
            return await get_telegram_file_url(bot_token, largest_photo.get("file_id"))
    except Exception as e:
        logger.warning("Failed to get Telegram user profile photo: %s", e)
        return None


async def set_telegram_webhook(bot_token: str, webhook_url: str) -> bool:
    """Register webhook URL with Telegram Bot API."""
    url = f"{TELEGRAM_API}/bot{bot_token}/setWebhook"
    payload = {
        "url": webhook_url,
        "allowed_updates": ["message"],
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=payload)
            data = response.json()
            logger.info(f"Telegram setWebhook response: {data}")
            return data.get("ok", False)
    except Exception as e:
        logger.error(f"Failed to set Telegram webhook: {e}")
        return False


async def delete_telegram_webhook(bot_token: str) -> bool:
    """Remove webhook from Telegram Bot API."""
    url = f"{TELEGRAM_API}/bot{bot_token}/deleteWebhook"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url)
            data = response.json()
            return data.get("ok", False)
    except Exception as e:
        logger.error(f"Failed to delete Telegram webhook: {e}")
        return False


async def get_telegram_bot_info(bot_token: str) -> dict | None:
    """Get bot info (username, name) from Telegram."""
    url = f"{TELEGRAM_API}/bot{bot_token}/getMe"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url)
            data = response.json()
            if data.get("ok"):
                return data["result"]
            return None
    except Exception as e:
        logger.warning(f"Failed to get Telegram bot info: {e}")
        return None
