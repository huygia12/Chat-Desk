import httpx
import logging
from app.services.meta_errors import MetaSendError

logger = logging.getLogger(__name__)

IG_GRAPH_API = "https://graph.facebook.com/v21.0"


def _meta_error(response: httpx.Response) -> MetaSendError:
    try:
        error = response.json().get("error", {})
    except ValueError:
        return MetaSendError(response.text[:500], status_code=response.status_code)

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
    return MetaSendError(
        " | ".join(parts),
        status_code=response.status_code,
        code=code,
        subcode=subcode,
        fbtrace_id=fbtrace_id,
    )


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
        "messaging_type": "RESPONSE",
    }
    params = {"access_token": page_access_token}

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload, params=params)
        if response.status_code >= 400:
            error = _meta_error(response)
            logger.warning("Instagram send failed (%s): %s", response.status_code, error.detail)
            raise error
        response.raise_for_status()
        data = response.json()
        return data.get("message_id")


async def send_instagram_attachment(
    page_access_token: str,
    recipient_id: str,
    attachment_url: str,
    attachment_kind: str,
) -> str | None:
    """Send an attachment by URL via Instagram Messaging API."""
    url = f"{IG_GRAPH_API}/me/messages"
    attachment_type = attachment_kind if attachment_kind in {"image", "video", "audio", "file"} else "file"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {
            "attachment": {
                "type": attachment_type,
                "payload": {"url": attachment_url, "is_reusable": True},
            }
        },
        "messaging_type": "RESPONSE",
    }
    params = {"access_token": page_access_token}

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload, params=params)
        if response.status_code >= 400:
            error = _meta_error(response)
            logger.warning("Instagram attachment send failed (%s): %s", response.status_code, error.detail)
            raise error
        response.raise_for_status()
        data = response.json()
        return data.get("message_id")


async def get_instagram_user_profile(page_access_token: str, user_id: str) -> dict | None:
    """Get Instagram messaging user profile from an Instagram-scoped sender ID."""
    url = f"{IG_GRAPH_API}/{user_id}"
    params = {
        "fields": "name,username,profile_pic",
        "access_token": page_access_token,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params=params)
            if response.status_code >= 400:
                detail = _meta_error(response).detail
                logger.warning(
                    "Failed to get Instagram user profile for %s (%s): %s",
                    user_id,
                    response.status_code,
                    detail,
                )
                return None
            data = response.json()
            logger.info(
                "Instagram profile lookup for %s returned fields=%s",
                user_id,
                sorted(data.keys()),
            )
            return data
    except Exception as e:
        logger.warning(f"Failed to get Instagram user profile for {user_id}: {e}")
        return None
