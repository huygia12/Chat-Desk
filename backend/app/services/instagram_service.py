import httpx
import logging

logger = logging.getLogger(__name__)

IG_GRAPH_API = "https://graph.facebook.com/v21.0"


async def send_instagram_message(
    page_access_token: str,
    recipient_id: str,
    message_text: str,
) -> str | None:
    """Send a message via Instagram Messaging API. Returns platform message ID."""
    url = f"{IG_GRAPH_API}/me/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": message_text},
    }
    params = {"access_token": page_access_token}

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload, params=params)
        response.raise_for_status()
        data = response.json()
        return data.get("message_id")
