import React, { useState, useEffect, useRef } from "react";
import { Input, Button } from "antd";
import {
  SendOutlined,
  CloseOutlined,
  MessageOutlined,
  PaperClipOutlined,
  FileOutlined,
  MenuOutlined,
  UserOutlined,
  MailOutlined,
} from "@ant-design/icons";
import { useI18n } from "../i18n/useI18n";
import MessageMarkdown from "./MessageMarkdown";
import "../styles/widget.css";

const getWidgetApiUrl = () =>
  (
    window.__chatdesk_api_url__ ||
    import.meta.env.VITE_API_URL ||
    `${window.location.protocol}//${window.location.host}`
  ).replace(/\/$/, "");

const resolveWidgetAttachmentUrl = (url) => {
  if (!url) return url;

  const apiUrl = getWidgetApiUrl();
  try {
    const parsed = new URL(url, apiUrl);
    if (parsed.pathname.startsWith("/api/files/")) {
      return `${apiUrl}${parsed.pathname}${parsed.search}`;
    }
    return parsed.href;
  } catch {
    return url;
  }
};

export default function WidgetChat({
  widgetId,
  widgetSecret,
  businessName = "Support",
  embedded = false, // true when rendered inside an iframe via embed.js
}) {
  // In embedded mode the chat panel is always visible (no floating-button toggle)
  const [isOpen, setIsOpen] = useState(embedded);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [visitorInfo, setVisitorInfo] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  // true only when visitorInfo was restored from localStorage (returning visitor)
  // false when the form was just submitted for the first time → no history fetch
  const [isReturningVisitor, setIsReturningVisitor] = useState(false);
  // Form state for visitor info (replaces prompt() which is blocked in cross-origin iframes)
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const { t, language } = useI18n();

  // Load visitor info from localStorage on mount (no prompt)
  useEffect(() => {
    const savedName = localStorage.getItem("widget_visitor_name");
    if (savedName) {
      let id = localStorage.getItem("widget_visitor_id");
      if (!id) {
        id = "visitor_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("widget_visitor_id", id);
      }
      setVisitorInfo({
        id,
        name: savedName,
        email: localStorage.getItem("widget_visitor_email") || null,
      });
      // This is a returning visitor — will trigger history fetch
      setIsReturningVisitor(true);
    }
  }, []);

  // Handle visitor form submit — always treated as a new session, no history
  const handleVisitorSubmit = () => {
    const trimmedName = nameInput.trim();
    if (!trimmedName) return;

    // Generate a fresh visitor_id so this session is isolated
    // (even if localStorage had a leftover id from a previous browser session)
    const id = "visitor_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("widget_visitor_id", id);
    localStorage.setItem("widget_visitor_name", trimmedName);
    localStorage.setItem("widget_visitor_email", emailInput.trim() || "");
    // isReturningVisitor stays false → no history fetch
    setVisitorInfo({ id, name: trimmedName, email: emailInput.trim() || null });
  };

  // Handle close: in embedded mode notify parent; otherwise toggle isOpen
  const handleClose = () => {
    if (embedded) {
      window.parent.postMessage({ type: "chatdesk-close-widget" }, "*");
    } else {
      setIsOpen(false);
    }
  };

  const visitorInitial = (visitorInfo?.name || businessName || "C").trim().charAt(0).toUpperCase();

  // Connect WebSocket to receive real-time replies from business/admin
  // Only after we have a conversationId (i.e., first message sent)
  useEffect(() => {
    if (!conversationId || !widgetId || !widgetSecret) return;

    const apiUrl = getWidgetApiUrl();
    const wsBase = apiUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const wsUrl =
      `${wsBase}/ws/widget/${widgetId}` +
      `?widget_secret=${encodeURIComponent(widgetSecret)}` +
      `&conversation_id=${encodeURIComponent(conversationId)}`;

    let ws;
    let reconnectTimer;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_message") {
            const msg = data.message;
            const incomingConversationId = data.conversation_id || msg.conversation_id;
            if (incomingConversationId && String(incomingConversationId) !== String(conversationId)) {
              return;
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [
                ...prev,
                {
                  id: msg.id,
                  content: msg.content,
                  sender: msg.sender_type === "contact" ? "customer" : msg.sender_type,
                  timestamp: new Date(msg.created_at),
                  attachment_url: msg.attachment_url,
                  attachment_filename: msg.attachment_filename,
                  attachment_mime_type: msg.attachment_mime_type,
                  attachment_size: msg.attachment_size,
                  attachment_kind: msg.attachment_kind,
                },
              ];
            });
          }
        } catch (e) {
          console.error("Widget WS parse error:", e);
        }
      };

      ws.onclose = () => {
        if (destroyed) return;
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [conversationId, widgetId, widgetSecret]);

  // On mount: if returning visitor, fetch history by visitor_id from backend
  useEffect(() => {
    if (!isReturningVisitor || !visitorInfo || !widgetId || !widgetSecret) return;

    const apiUrl = getWidgetApiUrl();

    fetch(
      `${apiUrl}/api/widgets/${widgetId}/history` +
        `?widget_secret=${encodeURIComponent(widgetSecret)}` +
        `&visitor_id=${encodeURIComponent(visitorInfo.id)}` +
        `&visitor_email=${encodeURIComponent(visitorInfo.email || "")}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!data || !Array.isArray(data.messages)) return;
        if (data.conversation_id) {
          setConversationId(data.conversation_id);
          localStorage.setItem("widget_conversation_id", data.conversation_id);
        }
        if (data.messages.length > 0) {
          setMessages(
            data.messages.map((m) => ({
              id: m.id,
              content: m.content,
              sender: m.sender_type === "contact" ? "customer" : m.sender_type,
              timestamp: new Date(m.created_at),
              attachment_url: m.attachment_url,
              attachment_filename: m.attachment_filename,
              attachment_mime_type: m.attachment_mime_type,
              attachment_size: m.attachment_size,
              attachment_kind: m.attachment_kind,
            }))
          );
        }
      })
      .catch(() => {});
  }, [isReturningVisitor, visitorInfo]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !visitorInfo) return;

    const messageText = inputValue.trim();
    setInputValue("");
    setLoading(true);

    try {
      const apiUrl = getWidgetApiUrl();

      const response = await fetch(`${apiUrl}/api/widgets/send`, {
        method: "POST",
        headers: {
          "widget-id": widgetId,
          "widget-secret": widgetSecret,
          "x-widget-origin":
            window.__chatdesk_parent_origin__ || window.location.origin,
          "Content-Type": "application/json",
          "X-Language": language,
          "Accept-Language":
            language === "vi" ? "vi-VN,vi;q=0.9,en;q=0.8" : "en-US,en;q=0.9,vi;q=0.8",
        },
        body: JSON.stringify({
          visitor_id: visitorInfo.id,
          visitor_name: visitorInfo.name,
          visitor_email: visitorInfo.email,
          message_text: messageText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to send message");
      }

      const result = await response.json();
      setConversationId(result.conversation_id);
      localStorage.setItem("widget_conversation_id", result.conversation_id);

      setMessages((prev) => [
        ...prev,
        {
          id: result.message_id,
          content: messageText,
          sender: "customer",
          timestamp: new Date(),
        },
      ]);

      if (result.ai_response) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            content: result.ai_response,
            sender: "ai",
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
        content: `⚠️ ${t("widget.sendError", { reason: error.message })}`,
          sender: "system",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !visitorInfo) return;

    setLoading(true);
    try {
      const apiUrl = getWidgetApiUrl();

      const formData = new FormData();
      formData.append("visitor_id", visitorInfo.id);
      formData.append("visitor_name", visitorInfo.name);
      formData.append("visitor_email", visitorInfo.email || "");
      formData.append("message_text", inputValue.trim());
      formData.append("file", file);

      const response = await fetch(`${apiUrl}/api/widgets/send-file`, {
        method: "POST",
        headers: {
          "widget-id": widgetId,
          "widget-secret": widgetSecret,
          "x-widget-origin":
            window.__chatdesk_parent_origin__ || window.location.origin,
          "X-Language": language,
          "Accept-Language":
            language === "vi" ? "vi-VN,vi;q=0.9,en;q=0.8" : "en-US,en;q=0.9,vi;q=0.8",
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to send file");
      }

      const result = await response.json();
      setInputValue("");
      setConversationId(result.conversation_id);
      localStorage.setItem("widget_conversation_id", result.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: result.message_id,
          content: inputValue.trim() || result.attachment_filename,
          sender: "customer",
          timestamp: new Date(),
          attachment_url: result.attachment_url,
          attachment_filename: result.attachment_filename,
          attachment_mime_type: result.attachment_mime_type,
          attachment_size: result.attachment_size,
          attachment_kind: result.attachment_kind,
        },
      ]);
    } catch (error) {
      console.error("Error sending file:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          content: `⚠️ ${t("widget.sendError", { reason: error.message })}`,
          sender: "system",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Visitor form (shown when visitorInfo not yet set) ---
  const renderVisitorForm = () => (
    <div className="widget-visitor-form">
      <div className="widget-visitor-title">{t("widget.visitorTitle")}</div>
      <div className="widget-visitor-subtitle">
        {t("widget.visitorSubtitle")}
      </div>
      <Input
        placeholder={t("widget.namePlaceholder")}
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        onPressEnter={handleVisitorSubmit}
        style={{ marginBottom: 12 }}
      />
      <Input
        placeholder={t("widget.emailPlaceholder")}
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        onPressEnter={handleVisitorSubmit}
        style={{ marginBottom: 16 }}
      />
      <Button
        type="primary"
        block
        onClick={handleVisitorSubmit}
        disabled={!nameInput.trim()}
      >
        {t("widget.startChat")}
      </Button>
    </div>
  );

  const renderMessageContent = (msg) => {
    if (!msg.attachment_url) return <MessageMarkdown>{msg.content}</MessageMarkdown>;

    const fileName = msg.attachment_filename || msg.content || "attachment";
    const isImage = msg.attachment_kind === "image" || msg.attachment_mime_type?.startsWith("image/");
    const attachmentUrl = resolveWidgetAttachmentUrl(msg.attachment_url);

    return (
      <>
        {msg.content && msg.content !== fileName && <MessageMarkdown>{msg.content}</MessageMarkdown>}
        <a className="widget-attachment" href={attachmentUrl} target="_blank" rel="noreferrer">
          {isImage ? (
            <img src={attachmentUrl} alt={fileName} className="widget-attachment-image" />
          ) : (
            <span className="widget-attachment-file">
              <FileOutlined />
              {fileName}
            </span>
          )}
        </a>
      </>
    );
  };

  // --- Chat panel (header + messages + input) ---
  const renderChatPanel = () => (
    <>
      <div className="widget-header">
        <div className="widget-brand">
          <div className="widget-brand-avatar">{visitorInitial}</div>
          <div>
            <div className="widget-title">{businessName}</div>
            <div className="widget-subtitle">{t("widget.chatWithUs")}</div>
          </div>
        </div>
        <div className="widget-header-actions">
          <button
            className={`widget-header-button ${profileOpen ? "widget-header-button-active" : ""}`}
            onClick={() => setProfileOpen((value) => !value)}
            title={t("widget.profileMenu")}
            type="button"
          >
            <MenuOutlined />
          </button>
          <button className="widget-header-button" onClick={handleClose} title={t("widget.closeChat")} type="button">
            <CloseOutlined />
          </button>
        </div>
        {profileOpen && visitorInfo && (
          <div className="widget-profile-popover">
            <div className="widget-profile-row">
              <UserOutlined />
              <span>{visitorInfo.name}</span>
            </div>
            {visitorInfo.email && (
              <div className="widget-profile-row">
                <MailOutlined />
                <span>{visitorInfo.email}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="widget-messages">
        {messages.length === 0 ? (
          <div className="widget-empty-msg">
            {t("widget.emptyMessage")}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`widget-message widget-message-${msg.sender} ${
                msg.attachment_url &&
                (msg.attachment_kind === "image" || msg.attachment_mime_type?.startsWith("image/"))
                  ? "widget-message-image"
                  : ""
              }`}
            >
              <div className="widget-message-bubble">{renderMessageContent(msg)}</div>
              <div className="widget-message-time">
                {msg.timestamp.toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="widget-input-area">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleSendFile}
          style={{ display: "none" }}
        />
        <Button
          className="widget-attach-button"
          icon={<PaperClipOutlined />}
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        />
        <Input.TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t("widget.inputPlaceholder")}
          disabled={loading}
          rows={1}
          style={{ resize: "none" }}
        />
        <Button
          className="widget-send-button"
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSendMessage}
          loading={loading}
          disabled={!inputValue.trim()}
        />
      </div>
    </>
  );

  // ============================================================
  // EMBEDDED MODE: fills the iframe completely, no floating button
  // ============================================================
  if (embedded) {
    return (
      <div className="widget-embedded">
        {!visitorInfo ? renderVisitorForm() : renderChatPanel()}
      </div>
    );
  }

  // ============================================================
  // STANDALONE MODE: floating button + toggle (used on /widget page directly)
  // ============================================================
  return (
    <div className="widget-container">
      {!isOpen && (
        <button
          className="widget-button"
          onClick={() => setIsOpen(true)}
          title={t("widget.openChat")}
        >
          <MessageOutlined style={{ fontSize: "20px" }} />
        </button>
      )}

      {isOpen && (
        <div className="widget-window">
          {!visitorInfo ? renderVisitorForm() : renderChatPanel()}
        </div>
      )}
    </div>
  );
}
