import React, { useState, useEffect, useRef } from "react";
import { Input, Button, Spin, Empty, message } from "antd";
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
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [visitorInfo, setVisitorInfo] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

  // Initialize visitor info from localStorage
  useEffect(() => {
    const generateVisitorId = () => {
      let id = localStorage.getItem("widget_visitor_id");
      if (!id) {
        id = "visitor_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("widget_visitor_id", id);
      }
      return id;
    };

    const name =
      localStorage.getItem("widget_visitor_name") ||
      prompt("Tên của bạn?", "Khách hàng");
    const email =
      localStorage.getItem("widget_visitor_email") ||
      prompt("Email của bạn? (Tùy chọn)", "");

    if (name) {
      localStorage.setItem("widget_visitor_name", name);
      localStorage.setItem("widget_visitor_email", email || "");

      setVisitorInfo({
        id: generateVisitorId(),
        name: name,
        email: email || null,
      });
    }
  }, []);

  // Connect WebSocket when widget opens
  useEffect(() => {
    if (isOpen && visitorInfo) {
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isOpen, visitorInfo]);

  const connectWebSocket = () => {
    // Extract business_id from window location or use a fallback
    // In embedded widget context, this will be provided by the parent page
    const businessId = window.__chatdesk_business_id__ || "default";
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/${businessId}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("Widget WebSocket connected");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data.type === "new_message" &&
            data.conversation_id === conversationId
          ) {
            setMessages((prev) => [
              ...prev,
              {
                id: data.message.id,
                content: data.message.content,
                sender:
                  data.message.sender_type === "contact"
                    ? "customer"
                    : data.message.sender_type,
                timestamp: new Date(data.message.created_at),
              },
            ]);
          }
        } catch (e) {
          console.error("Failed to parse WS message:", e);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("Widget WebSocket error:", error);
      };

      wsRef.current.onclose = () => {
        console.log("Widget WebSocket disconnected");
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !visitorInfo) return;

    const messageText = inputValue.trim();
    setInputValue("");
    setLoading(true);

    try {
      // Determine API URL from environment or current location
      const apiUrl =
        import.meta.env.VITE_API_URL ||
        `${window.location.protocol}//${window.location.host}`;

      const response = await fetch(`${apiUrl}/api/widgets/send`, {
        method: "POST",
        headers: {
          "widget-id": widgetId,
          "widget-secret": widgetSecret,
          origin: window.location.origin,
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

      // Add customer message to local state
      setMessages((prev) => [
        ...prev,
        {
          id: result.message_id,
          content: messageText,
          sender: "customer",
          timestamp: new Date(),
        },
      ]);

      // Add AI response if available
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
      message.error("Lỗi gửi tin nhắn: " + error.message);
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

  if (!visitorInfo) {
    return (
      <div className="widget-container">
        <div className="widget-loading">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="widget-container">
      {/* Floating Button */}
      {!isOpen && (
        <button
          className="widget-button"
          onClick={() => setIsOpen(true)}
          title="Open chat"
        >
          <MessageOutlined style={{ fontSize: "20px" }} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="widget-window">
          {/* Header */}
          <div className="widget-header">
            <div className="widget-title">{businessName}</div>
            <button
              className="widget-close"
              onClick={() => setIsOpen(false)}
              title="Close chat"
            >
              <CloseOutlined />
            </button>
          </div>

          {/* Messages */}
          <div className="widget-messages">
            {messages.length === 0 ? (
              <Empty
                description="Chưa có tin nhắn"
                style={{ marginTop: "50px" }}
              />
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

          {/* Input */}
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
        </div>
      )}
    </div>
  );
}
