import httpx
import logging

logger = logging.getLogger(__name__)

FB_GRAPH_API = "https://graph.facebook.com/v21.0"


async def send_facebook_message(
    page_access_token: str,
    recipient_id: str,
    message_text: str,
) -> str | None:
    """Send a message via Facebook Messenger API. Returns platform message ID."""
    url = f"{FB_GRAPH_API}/me/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": message_text},
        "messaging_type": "RESPONSE",
    }
    params = {"access_token": page_access_token}

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload, params=params)
        response.raise_for_status()
        data = response.json()
        return data.get("message_id")


async def get_facebook_user_profile(page_access_token: str, user_id: str) -> dict | None:
    """Get user profile from Facebook."""
    url = f"{FB_GRAPH_API}/{user_id}"
    params = {
        "fields": "first_name,last_name,profile_pic",
        "access_token": page_access_token,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.warning(f"Failed to get FB user profile for {user_id}: {e}")
        return None
