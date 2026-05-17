import httpx
import logging

logger = logging.getLogger(__name__)

FB_GRAPH_API = "https://graph.facebook.com/v21.0"


def _meta_error_detail(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
    except ValueError:
        return response.text[:500]

    message = error.get("message") or response.text[:500]
    code = error.get("code")
    subcode = error.get("error_subcode")
    fbtrace_id = error.get("fbtrace_id")
    parts = [message]
    if code is not None:
        parts.append(f"code={code}")
    if subcode is not None:
        parts.append(f"subcode={subcode}")
    if fbtrace_id:
        parts.append(f"fbtrace_id={fbtrace_id}")
    return " | ".join(parts)


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
        if response.status_code >= 400:
            detail = _meta_error_detail(response)
            logger.warning("Facebook send failed (%s): %s", response.status_code, detail)
            raise RuntimeError(detail)
        response.raise_for_status()
        data = response.json()
        return data.get("message_id")


async def get_facebook_user_profile(page_access_token: str, user_id: str) -> dict | None:
    """Get user profile from Facebook."""
    url = f"{FB_GRAPH_API}/{user_id}"
    params = {
        "fields": "name,first_name,last_name,profile_pic",
        "access_token": page_access_token,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params=params)
            if response.status_code >= 400:
                detail = _meta_error_detail(response)
                logger.warning(
                    "Failed to get FB user profile for %s (%s): %s",
                    user_id,
                    response.status_code,
                    detail,
                )
                return None
            data = response.json()
            logger.info(
                "Facebook profile lookup for %s returned fields=%s",
                user_id,
                sorted(data.keys()),
            )
            return data
    except Exception as e:
        logger.warning(f"Failed to get FB user profile for {user_id}: {e}")
        return None
