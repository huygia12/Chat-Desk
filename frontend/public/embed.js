/**
 * ChatDesk Widget Embed Script
 *
 * Usage in customer's website:
 * <script>
 *   window.ChatDeskWidget = {
 *     widgetId: 'YOUR_WIDGET_ID',
 *     widgetSecret: 'YOUR_WIDGET_SECRET',
 *     businessName: 'Your Business Name', // optional
 *     apiUrl: 'https://your-api.com', // optional, auto-detect if not provided
 *   };
 * </script>
 * <script src="https://your-app.com/embed.js"></script>
 */

(function () {
  "use strict";

  // Get configuration from window or script attributes
  const config = window.ChatDeskWidget || {};
  const widgetId = config.widgetId;
  const widgetSecret = config.widgetSecret;
  const businessName = config.businessName || "Support";
  const apiUrl = config.apiUrl || detectApiUrl();

  if (!widgetId || !widgetSecret) {
    console.error("ChatDesk Widget: widgetId and widgetSecret are required");
    return;
  }

  // Detect the origin where embed.js is hosted (frontend) to build the iframe URL.
  // This is always the frontend origin, separate from the backend apiUrl.
  function detectWidgetOrigin() {
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      if (script.src && script.src.includes("/embed.js")) {
        const url = new URL(script.src);
        return url.origin;
      }
    }
    return window.location.origin;
  }

  function detectApiUrl() {
    // Try to get from script src
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      if (script.src && script.src.includes("/embed.js")) {
        const url = new URL(script.src);
        return url.origin;
      }
    }
    // Default fallback
    return window.location.origin;
  }

  const widgetOrigin = detectWidgetOrigin();

  // Create container
  const container = document.createElement("div");
  container.id = "chatdesk-widget-container";
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
    z-index: 9999;
  `;

  // Inject styles
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    /* Widget Container */
    #chatdesk-widget-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
      z-index: 9999;
    }

    /* Floating Button */
    #chatdesk-widget-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1890ff 0%, #0050b3 100%);
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.23, 1, 0.320, 1);
      font-size: 24px;
      position: absolute;
      bottom: 0;
      right: 0;
    }

    #chatdesk-widget-button:hover {
      background: linear-gradient(135deg, #0050b3 0%, #003a8c 100%);
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(24, 144, 255, 0.5);
    }

    #chatdesk-widget-button:active {
      transform: scale(0.95);
    }

    /* Chat Window */
    #chatdesk-widget-window {
      position: absolute;
      bottom: 90px;
      right: 0;
      width: 380px;
      height: 600px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
      display: none;
      flex-direction: column;
      animation: chatdesk-slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      overflow: hidden;
    }

    #chatdesk-widget-window.open {
      display: flex;
    }

    @keyframes chatdesk-slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Chat Window Iframe */
    #chatdesk-widget-iframe {
      border: none;
      width: 100%;
      height: 100%;
      border-radius: 12px;
    }

    /* Responsive */
    @media (max-width: 480px) {
      #chatdesk-widget-window {
        position: fixed;
        bottom: 0;
        right: 0;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        border-radius: 0;
      }

      #chatdesk-widget-iframe {
        border-radius: 0;
      }
    }
  `;
  document.head.appendChild(styleSheet);

  // Create button
  const button = document.createElement("button");
  button.id = "chatdesk-widget-button";
  button.innerHTML = "💬";
  button.setAttribute("title", "Open chat");
  button.setAttribute("aria-label", "Open chat");

  // Create chat window
  const chatWindow = document.createElement("div");
  chatWindow.id = "chatdesk-widget-window";

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.id = "chatdesk-widget-iframe";
  iframe.title = "Chat Widget";

  // Build iframe URL using the frontend origin (where embed.js is served from),
  // NOT apiUrl which points to the backend API.
  const iframeUrl = new URL(`${widgetOrigin}/widget`);
  iframeUrl.searchParams.append("id", widgetId);
  iframeUrl.searchParams.append("name", businessName);
  iframe.src = iframeUrl.toString();

  // Store business_id in window for iframe to access
  // The iframe will get business_id from the backend based on widget_id
  window.__chatdesk_widget_id__ = widgetId;

  chatWindow.appendChild(iframe);
  container.appendChild(button);
  container.appendChild(chatWindow);
  document.body.appendChild(container);

  // Send widget config to iframe via postMessage after it loads
  iframe.onload = function () {
    setTimeout(() => {
      iframe.contentWindow.postMessage(
        {
          type: "chatdesk-config",
          widgetId: widgetId,
          widgetSecret: widgetSecret,
          businessName: businessName,
          apiUrl: apiUrl,
          parentOrigin: window.location.origin,
        },
        "*",
      );
    }, 100);
  };

  // Toggle chat window
  button.addEventListener("click", function () {
    chatWindow.classList.toggle("open");
    if (chatWindow.classList.contains("open")) {
      button.style.opacity = "0.3";
      button.style.pointerEvents = "none";
    } else {
      button.style.opacity = "1";
      button.style.pointerEvents = "auto";
    }
  });

  // Handle cross-origin communication if needed
  window.addEventListener("message", function (event) {
    if (event.data.type === "chatdesk-close-widget") {
      chatWindow.classList.remove("open");
      button.style.opacity = "1";
      button.style.pointerEvents = "auto";
    }
  });

  console.log("ChatDesk widget initialized", { widgetId, apiUrl });
})();
