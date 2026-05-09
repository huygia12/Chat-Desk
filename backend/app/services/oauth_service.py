import httpx
import logging
from urllib.parse import urlencode
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

FB_GRAPH_API = "https://graph.facebook.com/v21.0"
FB_OAUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth"


def get_facebook_oauth_url(state: str) -> str:
    """Generate Facebook OAuth URL for user authorization."""
    params = {
        "client_id": settings.FB_APP_ID,
        "redirect_uri": settings.FB_OAUTH_REDIRECT_URI,
        "state": state,
    }
    
    # Facebook Login for Business requires config_id instead of scope
    if settings.FB_CONFIG_ID:
        params["config_id"] = settings.FB_CONFIG_ID
        params["response_type"] = "code"
        params["override_default_response_type"] = "true"
        logger.info(f"Using FLFB config_id: {settings.FB_CONFIG_ID}")
    else:
        # Fallback to classic scope-based login
        params["scope"] = "pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata,instagram_basic,instagram_manage_messages"
        logger.info("Using classic scope-based OAuth (no config_id set)")
    
    return f"{FB_OAUTH_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    """Exchange authorization code for a long-lived access token."""
    url = f"{FB_GRAPH_API}/oauth/access_token"
    params = {
        "client_id": settings.FB_APP_ID,
        "client_secret": settings.FB_APP_SECRET,
        "redirect_uri": settings.FB_OAUTH_REDIRECT_URI,
        "code": code,
    }
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        short_token = data["access_token"]
        expires_in = data.get("expires_in", "unknown")
        logger.info(f"Code exchange success, token_type={data.get('token_type')}, expires_in={expires_in}")
        
        # Exchange for long-lived token (required for Facebook Login for Business)
        ll_url = f"{FB_GRAPH_API}/oauth/access_token"
        ll_params = {
            "grant_type": "fb_exchange_token",
            "client_id": settings.FB_APP_ID,
            "client_secret": settings.FB_APP_SECRET,
            "fb_exchange_token": short_token,
        }
        ll_response = await client.get(ll_url, params=ll_params)
        if ll_response.status_code == 200:
            ll_data = ll_response.json()
            long_token = ll_data["access_token"]
            ll_expires = ll_data.get("expires_in", "unknown")
            logger.info(f"Long-lived token obtained, expires_in={ll_expires}")
            return long_token
        else:
            logger.warning(f"Long-lived token exchange failed ({ll_response.status_code}), using short-lived token")
            return short_token


async def _debug_token_info(access_token: str):
    """Debug: log user info and granted permissions."""
    async with httpx.AsyncClient(timeout=30) as client:
        # Check who the token belongs to
        me_resp = await client.get(
            f"{FB_GRAPH_API}/me",
            params={"access_token": access_token, "fields": "id,name"}
        )
        logger.info(f"DEBUG /me => {me_resp.status_code}: {me_resp.text[:300]}")
        
        # Check granted permissions
        perm_resp = await client.get(
            f"{FB_GRAPH_API}/me/permissions",
            params={"access_token": access_token}
        )
        logger.info(f"DEBUG /me/permissions => {perm_resp.status_code}: {perm_resp.text[:500]}")


async def get_user_pages(user_access_token: str) -> list[dict]:
    """Get list of pages that user manages. Tries multiple approaches."""
    # Debug: log token info before querying pages
    await _debug_token_info(user_access_token)
    
    async with httpx.AsyncClient(timeout=30) as client:
        # ---- Approach 1: Standard /me/accounts ----
        response = await client.get(
            f"{FB_GRAPH_API}/me/accounts",
            params={"access_token": user_access_token, "fields": "id,name,access_token"},
        )
        logger.info(f"[Approach 1] GET /me/accounts => {response.status_code}: {response.text[:500]}")
        if response.status_code == 200:
            pages = response.json().get("data", [])
            if pages:
                logger.info(f"[Approach 1] Found {len(pages)} page(s)")
                return pages
        
        # ---- Approach 2: Field expansion on /me ----
        response2 = await client.get(
            f"{FB_GRAPH_API}/me",
            params={
                "access_token": user_access_token,
                "fields": "id,name,accounts{id,name,access_token}",
            },
        )
        logger.info(f"[Approach 2] GET /me?fields=accounts => {response2.status_code}: {response2.text[:500]}")
        if response2.status_code == 200:
            data2 = response2.json()
            accounts = data2.get("accounts", {}).get("data", [])
            if accounts:
                logger.info(f"[Approach 2] Found {len(accounts)} page(s)")
                return accounts
        
        # ---- Approach 3: Get user ID first, then /{user_id}/accounts ----
        me_resp = await client.get(
            f"{FB_GRAPH_API}/me",
            params={"access_token": user_access_token, "fields": "id"},
        )
        if me_resp.status_code == 200:
            user_id = me_resp.json().get("id")
            if user_id:
                response3 = await client.get(
                    f"{FB_GRAPH_API}/{user_id}/accounts",
                    params={"access_token": user_access_token, "fields": "id,name,access_token"},
                )
                logger.info(f"[Approach 3] GET /{user_id}/accounts => {response3.status_code}: {response3.text[:500]}")
                if response3.status_code == 200:
                    pages3 = response3.json().get("data", [])
                    if pages3:
                        logger.info(f"[Approach 3] Found {len(pages3)} page(s)")
                        return pages3
        
        logger.warning("All approaches returned 0 pages")
        return []


async def subscribe_page_webhook(page_id: str, page_access_token: str) -> bool:
    """Subscribe page to webhooks."""
    url = f"{FB_GRAPH_API}/{page_id}/subscribed_apps"
    params = {
        "access_token": page_access_token,
        "subscribed_fields": "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads",
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, params=params)
            response.raise_for_status()
            return True
    except Exception as e:
        logger.warning(f"Failed to subscribe webhook for page {page_id}: {e}")
        return False


async def get_instagram_accounts(page_id: str, page_access_token: str) -> list[dict]:
    """Get Instagram business accounts connected to a Facebook Page."""
    url = f"{FB_GRAPH_API}/{page_id}"
    params = {
        "access_token": page_access_token,
        "fields": "instagram_business_account",
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            ig_account = data.get("instagram_business_account")
            if ig_account:
                # Get IG account details
                ig_url = f"{FB_GRAPH_API}/{ig_account['id']}"
                ig_params = {
                    "access_token": page_access_token,
                    "fields": "id,username,name",
                }
                ig_response = await client.get(ig_url, params=ig_params)
                ig_response.raise_for_status()
                return [ig_response.json()]
            return []
    except Exception as e:
        logger.warning(f"Failed to get Instagram accounts for page {page_id}: {e}")
        return []
