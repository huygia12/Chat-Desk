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
