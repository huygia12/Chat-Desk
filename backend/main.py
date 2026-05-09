import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, users, channels, contacts, conversations, messages, products, webhooks, admin
from app.websocket.manager import manager
from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ChatDesk backend starting...")

    # Connect to Milvus
    try:
        from app.services.milvus_service import connect_milvus
        connect_milvus()
        logger.info("Milvus connected")
    except Exception as e:
        logger.warning(f"Failed to connect to Milvus: {e}")

    # Pre-load embedding model at startup
    try:
        from app.services.embedding_service import get_embedding
        await get_embedding("warmup")
        logger.info("Embedding model pre-loaded")
    except Exception as e:
        logger.warning(f"Failed to pre-load embedding model: {e}")

    yield

    # Disconnect Milvus
    try:
        from app.services.milvus_service import disconnect_milvus
        disconnect_milvus()
    except Exception:
        pass
    logger.info("ChatDesk backend shutting down...")


app = FastAPI(
    title="ChatDesk API",
    description="Omni-channel chatbot platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
settings = get_settings()
allowed_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(channels.router)
app.include_router(contacts.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(products.router)
app.include_router(webhooks.router)
app.include_router(admin.router)


# WebSocket endpoint
@app.websocket("/ws/{business_id}")
async def websocket_endpoint(websocket: WebSocket, business_id: str):
    await manager.connect(business_id, websocket)
    try:
        while True:
            # Keep connection alive, receive pings
            data = await websocket.receive_text()
            logger.debug(f"WS received from {business_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(business_id, websocket)


@app.get("/")
async def root():
    return {"message": "ChatDesk API is running", "docs": "/docs"}


# === Facebook App Required Pages ===
from fastapi.responses import HTMLResponse


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_policy():
    """Privacy Policy page (required by Facebook App)."""
    return """
    <!DOCTYPE html>
    <html><head><title>ChatDesk - Privacy Policy</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#333}
    h1{color:#1890ff}h2{margin-top:24px}</style></head>
    <body>
    <h1>ChatDesk - Privacy Policy</h1>
    <p><strong>Last updated:</strong> February 2026</p>
    <h2>1. Information We Collect</h2>
    <p>ChatDesk collects the following information when you connect your Facebook/Instagram accounts:</p>
    <ul>
      <li>Facebook Page information (Page name, Page ID)</li>
      <li>Instagram business account information</li>
      <li>Messages received through your connected pages</li>
      <li>Contact information of people who message your pages (name, profile picture)</li>
    </ul>
    <h2>2. How We Use Information</h2>
    <p>We use this information to:</p>
    <ul>
      <li>Display messages from your customers in a unified inbox</li>
      <li>Enable AI-powered auto-replies to customer messages</li>
      <li>Provide product-related answers using your product catalog</li>
    </ul>
    <h2>3. Data Storage</h2>
    <p>All data is stored securely on our servers. We do not sell or share your data with third parties.</p>
    <h2>4. Data Deletion</h2>
    <p>You can request deletion of your data at any time by contacting us or using our 
    <a href="/data-deletion">data deletion</a> endpoint.</p>
    <h2>5. Contact</h2>
    <p>For questions about this policy, contact: <a href="mailto:lamkhoi.dev@gmail.com">lamkhoi.dev@gmail.com</a></p>
    </body></html>
    """


@app.get("/data-deletion", response_class=HTMLResponse)
async def data_deletion_page():
    """Data deletion instructions page (required by Facebook App)."""
    return """
    <!DOCTYPE html>
    <html><head><title>ChatDesk - Data Deletion</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#333}
    h1{color:#1890ff}</style></head>
    <body>
    <h1>ChatDesk - Data Deletion Request</h1>
    <p>To request deletion of your data from ChatDesk:</p>
    <ol>
      <li>Log into your ChatDesk account</li>
      <li>Go to Settings</li>
      <li>Click "Delete Account" to remove all your data</li>
    </ol>
    <p>Or contact us at: <a href="mailto:lamkhoi.dev@gmail.com">lamkhoi.dev@gmail.com</a></p>
    <p>We will process your request within 30 days.</p>
    </body></html>
    """


@app.post("/api/data-deletion/callback")
async def data_deletion_callback():
    """Facebook data deletion callback endpoint."""
    return {
        "url": "https://omnichannelchatbotserver-production.up.railway.app/data-deletion",
        "confirmation_code": "chatdesk_deletion_confirmed"
    }


@app.get("/test/facebook", response_class=HTMLResponse)
async def test_facebook_integration():
    """Test page to verify Facebook App integration."""
    settings = get_settings()
    return f"""
    <!DOCTYPE html>
    <html><head><title>ChatDesk - FB Integration Test</title>
    <style>
      body{{font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#333}}
      h1{{color:#1890ff}} h2{{margin-top:24px;color:#333}}
      .card{{border:1px solid #e8e8e8;border-radius:8px;padding:16px;margin:12px 0;background:#fafafa}}
      .ok{{color:#52c41a;font-weight:bold}} .warn{{color:#faad14;font-weight:bold}} .err{{color:#ff4d4f;font-weight:bold}}
      code{{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:13px}}
      button{{background:#1890ff;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;margin:4px}}
      button:hover{{background:#40a9ff}}
      .result{{margin-top:8px;padding:12px;background:#f6f6f6;border-radius:6px;font-family:monospace;font-size:13px;white-space:pre-wrap}}
      table{{border-collapse:collapse;width:100%}} td,th{{border:1px solid #e8e8e8;padding:8px 12px;text-align:left}}
      th{{background:#fafafa}}
    </style>
    </head>
    <body>
    <h1>ChatDesk - Facebook Integration Test</h1>
    
    <h2>1. Server Status</h2>
    <div class="card">
      <p class="ok">Server is running</p>
      <table>
        <tr><th>Config</th><th>Value</th><th>Status</th></tr>
        <tr><td>FB_APP_ID</td><td><code>{settings.FB_APP_ID[:8]}...</code></td>
            <td class="{'ok' if settings.FB_APP_ID else 'err'}">{'Set' if settings.FB_APP_ID else 'MISSING'}</td></tr>
        <tr><td>FB_APP_SECRET</td><td><code>{'***' + settings.FB_APP_SECRET[-4:] if settings.FB_APP_SECRET else ''}</code></td>
            <td class="{'ok' if settings.FB_APP_SECRET else 'err'}">{'Set' if settings.FB_APP_SECRET else 'MISSING'}</td></tr>
        <tr><td>FB_VERIFY_TOKEN</td><td><code>{settings.FB_VERIFY_TOKEN}</code></td>
            <td class="ok">Set</td></tr>
        <tr><td>FB_OAUTH_REDIRECT_URI</td><td><code>{settings.FB_OAUTH_REDIRECT_URI}</code></td>
            <td class="{'ok' if 'railway' in settings.FB_OAUTH_REDIRECT_URI else 'warn'}">{'Production' if 'railway' in settings.FB_OAUTH_REDIRECT_URI else 'Localhost'}</td></tr>
        <tr><td>GROQ_API_KEY</td><td><code>{'***' + settings.GROQ_API_KEY[-4:] if settings.GROQ_API_KEY else ''}</code></td>
            <td class="{'ok' if settings.GROQ_API_KEY else 'err'}">{'Set' if settings.GROQ_API_KEY else 'MISSING'}</td></tr>
        <tr><td>MILVUS_URI</td><td><code>{settings.MILVUS_URI[:30]}...</code></td>
            <td class="{'ok' if settings.MILVUS_URI else 'warn'}">{'Set' if settings.MILVUS_URI else 'Not set'}</td></tr>
      </table>
    </div>

    <h2>2. API Endpoints Test</h2>
    <div class="card">
      <button onclick="testEndpoint('/api/auth/login', 'POST', {{email:'admin@chatdesk.vn',password:'admin123'}})">Test Login (Admin)</button>
      <button onclick="testEndpoint('/docs', 'GET')">Open API Docs</button>
      <button onclick="testWebhookVerify()">Test Webhook Verify</button>
      <button onclick="testEndpoint('/privacy', 'GET')">Privacy Policy</button>
      <button onclick="testEndpoint('/data-deletion', 'GET')">Data Deletion</button>
      <div id="result" class="result" style="display:none"></div>
    </div>

    <h2>3. Facebook App Configuration Checklist</h2>
    <div class="card">
      <table>
        <tr><th>Setting</th><th>Required Value</th></tr>
        <tr><td>App Domains</td><td><code>omnichannelchatbotserver-production.up.railway.app</code></td></tr>
        <tr><td>Privacy Policy URL</td><td><code>https://omnichannelchatbotserver-production.up.railway.app/privacy</code></td></tr>
        <tr><td>Data Deletion URL</td><td><code>https://omnichannelchatbotserver-production.up.railway.app/api/data-deletion/callback</code></td></tr>
        <tr><td>Valid OAuth Redirect URIs</td><td><code>{settings.FB_OAUTH_REDIRECT_URI}</code></td></tr>
        <tr><td>Webhook Callback URL</td><td><code>https://omnichannelchatbotserver-production.up.railway.app/api/webhooks/facebook</code></td></tr>
        <tr><td>Webhook Verify Token</td><td><code>{settings.FB_VERIFY_TOKEN}</code></td></tr>
        <tr><td>Webhook Fields</td><td><code>messages, messaging_postbacks, messaging_optins</code></td></tr>
      </table>
    </div>

    <h2>4. Seed Admin Account</h2>
    <div class="card">
      <p>Email: <code>admin@chatdesk.vn</code> | Password: <code>admin123</code></p>
      <p><strong>Note:</strong> Admin needs to be seeded manually via SQL. Run the seed_admin.sql script against your Railway database.</p>
    </div>

    <script>
    async function testEndpoint(url, method, body) {{
      const el = document.getElementById('result')
      el.style.display = 'block'
      el.textContent = 'Testing ' + method + ' ' + url + '...'
      try {{
        const opts = {{ method, headers: {{'Content-Type': 'application/json'}} }}
        if (body) opts.body = JSON.stringify(body)
        const res = await fetch(url, opts)
        const text = await res.text()
        let display = method + ' ' + url + '\\nStatus: ' + res.status + '\\n\\n'
        try {{ display += JSON.stringify(JSON.parse(text), null, 2) }} catch {{ display += text.substring(0, 500) }}
        el.textContent = display
      }} catch (e) {{
        el.textContent = 'Error: ' + e.message
      }}
    }}
    async function testWebhookVerify() {{
      const url = '/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token={settings.FB_VERIFY_TOKEN}&hub.challenge=test_challenge_123'
      const el = document.getElementById('result')
      el.style.display = 'block'
      el.textContent = 'Testing webhook verify...'
      try {{
        const res = await fetch(url)
        const text = await res.text()
        el.textContent = 'GET ' + url + '\\nStatus: ' + res.status + '\\nResponse: ' + text + '\\n\\n' +
          (text === 'test_challenge_123' ? '✅ Webhook verification PASSED!' : '❌ Webhook verification FAILED')
      }} catch (e) {{
        el.textContent = 'Error: ' + e.message
      }}
    }}
    </script>
    </body></html>
    """
