import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import WidgetChat from "../components/WidgetChat";
import { useI18n } from "../i18n/useI18n";
import "../styles/widget-page.css";

export default function WidgetPage() {
  const [searchParams] = useSearchParams();
  const widgetId = searchParams.get("id");
  const businessName = searchParams.get("name") || "Support";
  const [widgetSecret, setWidgetSecret] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configReceivedRef = useRef(false);
  const { t } = useI18n();

  // Get widget secret from parent window or request it
  useEffect(() => {
    if (!widgetId) {
      setError(t("widget.missingId"));
      setLoading(false);
      return;
    }

    // Listen for postMessage from parent (embed script)
    const handleMessage = (event) => {
      if (event.data.type === "chatdesk-config" && !configReceivedRef.current) {
        configReceivedRef.current = true;
        const { widgetSecret, apiUrl, parentOrigin } = event.data;
        if (!widgetSecret) {
          setError(t("widget.invalidConfig"));
          setLoading(false);
          return;
        }
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
        if (parentConfig.apiUrl) {
          window.__chatdesk_api_url__ = parentConfig.apiUrl;
        }
        window.__chatdesk_widget_id__ = widgetId;
        setLoading(false);
      }
      return () => window.removeEventListener("message", handleMessage);
    }

    // Request config from parent — retry up to 5 times with 400ms interval
    let attempts = 0;
    const maxAttempts = 5;
    const requestConfig = () => {
      if (configReceivedRef.current) return;
      window.parent.postMessage({ type: "chatdesk-request-config" }, "*");
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(requestConfig, 400);
      } else {
        // All retries exhausted
        if (!configReceivedRef.current) {
          configReceivedRef.current = true;
          setError(t("widget.connectError"));
          setLoading(false);
        }
      }
    };
    requestConfig();

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [t, widgetId]);

  if (loading) {
    return <div className="widget-page-loading">{t("widget.loading")}</div>;
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
        <p>{t("widget.missingId")}</p>
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
