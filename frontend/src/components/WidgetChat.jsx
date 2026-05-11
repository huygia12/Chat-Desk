import React, { useState, useEffect, useRef } from "react";
import { Input, Button } from "antd";
import {
  SendOutlined,
  CloseOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import "../styles/widget.css";

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
  // Form state for visitor info (replaces prompt() which is blocked in cross-origin iframes)
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

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
    }
  }, []);

  // Handle visitor form submit
  const handleVisitorSubmit = () => {
    const trimmedName = nameInput.trim();
    if (!trimmedName) return;

    let id = localStorage.getItem("widget_visitor_id");
    if (!id) {
      id = "visitor_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("widget_visitor_id", id);
    }
    localStorage.setItem("widget_visitor_name", trimmedName);
    localStorage.setItem("widget_visitor_email", emailInput.trim() || "");
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

  // Connect WebSocket to receive real-time replies from business/admin
  // Only after we have a conversationId (i.e., first message sent)
  useEffect(() => {
    if (!conversationId || !widgetId || !widgetSecret) return;

    const apiUrl =
      window.__chatdesk_api_url__ ||
      import.meta.env.VITE_API_URL ||
      `${window.location.protocol}//${window.location.host}`;
    const wsBase = apiUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const wsUrl = `${wsBase}/ws/widget/${widgetId}?widget_secret=${encodeURIComponent(widgetSecret)}`;

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
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [
                ...prev,
                {
                  id: msg.id,
                  content: msg.content,
                  sender: msg.sender_type === "contact" ? "customer" : msg.sender_type,
                  timestamp: new Date(msg.created_at),
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

  // Fetch full conversation history after conversationId is set
  // This recovers messages sent while widget was not connected
  useEffect(() => {
    if (!conversationId || !widgetId || !widgetSecret) return;

    const apiUrl =
      window.__chatdesk_api_url__ ||
      import.meta.env.VITE_API_URL ||
      `${window.location.protocol}//${window.location.host}`;

    fetch(
      `${apiUrl}/api/widgets/${widgetId}/messages?widget_secret=${encodeURIComponent(widgetSecret)}&conversation_id=${conversationId}`
    )
      .then((r) => r.json())
      .then((history) => {
        if (!Array.isArray(history)) return;
        setMessages(
          history.map((m) => ({
            id: m.id,
            content: m.content,
            sender: m.sender_type === "contact" ? "customer" : m.sender_type,
            timestamp: new Date(m.created_at),
          }))
        );
      })
      .catch(() => {});
  }, [conversationId]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !visitorInfo) return;

    const messageText = inputValue.trim();
    setInputValue("");
    setLoading(true);

    try {
      const apiUrl =
        window.__chatdesk_api_url__ ||
        import.meta.env.VITE_API_URL ||
        `${window.location.protocol}//${window.location.host}`;

      const response = await fetch(`${apiUrl}/api/widgets/send`, {
        method: "POST",
        headers: {
          "widget-id": widgetId,
          "widget-secret": widgetSecret,
          "x-widget-origin":
            window.__chatdesk_parent_origin__ || window.location.origin,
          "Content-Type": "application/json",
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
          content: `⚠️ Lỗi: ${error.message}`,
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
      <div className="widget-visitor-title">Bắt đầu trò chuyện</div>
      <div className="widget-visitor-subtitle">
        Vui lòng cho chúng tôi biết về bạn
      </div>
      <Input
        placeholder="Tên của bạn *"
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        onPressEnter={handleVisitorSubmit}
        style={{ marginBottom: 12 }}
      />
      <Input
        placeholder="Email (tùy chọn)"
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
        Bắt đầu chat
      </Button>
    </div>
  );

  // --- Chat panel (header + messages + input) ---
  const renderChatPanel = () => (
    <>
      <div className="widget-header">
        <div className="widget-title">{businessName}</div>
        <button className="widget-close" onClick={handleClose} title="Close chat">
          <CloseOutlined />
        </button>
      </div>

      <div className="widget-messages">
        {messages.length === 0 ? (
          <div className="widget-empty-msg">
            Xin chào! Chúng tôi có thể giúp gì cho bạn? 👋
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`widget-message widget-message-${msg.sender}`}
            >
              <div className="widget-message-bubble">{msg.content}</div>
              <div className="widget-message-time">
                {msg.timestamp.toLocaleTimeString("vi-VN", {
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
        <Input.TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Nhập tin nhắn..."
          disabled={loading}
          rows={1}
          style={{ resize: "none" }}
        />
        <Button
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
          title="Open chat"
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
