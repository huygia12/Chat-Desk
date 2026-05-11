import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import WidgetChat from "../components/WidgetChat";
import "../styles/widget-page.css";

export default function WidgetPage() {
  const [searchParams] = useSearchParams();
  const widgetId = searchParams.get("id");
  const businessName = searchParams.get("name") || "Support";
  const [widgetSecret, setWidgetSecret] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configReceivedRef = useRef(false);

  // Get widget secret from parent window or request it
  useEffect(() => {
    if (!widgetId) {
      setError("Widget ID not provided");
      setLoading(false);
      return;
    }

    // Listen for postMessage from parent (embed script)
    const handleMessage = (event) => {
      if (event.data.type === "chatdesk-config" && !configReceivedRef.current) {
        configReceivedRef.current = true;
        const { widgetSecret, apiUrl, parentOrigin } = event.data;
        setWidgetSecret(widgetSecret);
        if (apiUrl) {
          window.__chatdesk_api_url__ = apiUrl;
        }
        if (parentOrigin) {
          window.__chatdesk_parent_origin__ = parentOrigin;
        }
        window.__chatdesk_widget_id__ = widgetId;
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);

    // Try to get secret from parent window's config (same-origin only)
    let parentConfig = null;
    try {
      parentConfig = window.parent.ChatDeskWidget;
    } catch (_e) {
      // Cross-origin parent – rely on postMessage instead
    }
    if (parentConfig && parentConfig.widgetSecret) {
      if (!configReceivedRef.current) {
        configReceivedRef.current = true;
        setWidgetSecret(parentConfig.widgetSecret);
        window.__chatdesk_widget_id__ = widgetId;
        setLoading(false);
      }
      return;
    }

    // Request config from parent
    window.parent.postMessage({ type: "chatdesk-request-config" }, "*");

    // Timeout - if no response, proceed anyway
    const timeout = setTimeout(() => {
      if (!configReceivedRef.current) {
        configReceivedRef.current = true;
        setWidgetSecret("");
        window.__chatdesk_widget_id__ = widgetId;
        setLoading(false);
      }
    }, 1000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeout);
    };
  }, [widgetId]);

  if (loading) {
    return <div className="widget-page-loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="widget-page-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!widgetId) {
    return (
      <div className="widget-page-error">
        <p>Widget ID not provided</p>
      </div>
    );
  }

  return (
    <div className="widget-page">
      <WidgetChat
        widgetId={widgetId}
        widgetSecret={widgetSecret}
        businessName={businessName}
        embedded={true}
      />
    </div>
  );
}
