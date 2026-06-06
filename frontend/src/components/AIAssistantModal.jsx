import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar, Button, Empty, Input, Modal, Spin, Tooltip, Typography, message, theme } from "antd";
import { FileTextOutlined, RobotOutlined, SendOutlined, UserOutlined } from "@ant-design/icons";
import client from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useI18n } from "../i18n/useI18n";
import MessageMarkdown from "./MessageMarkdown";

const HISTORY_PAGE_SIZE = 50;

const normalizeHistoryPage = (payload) => {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      has_more: false,
      next_cursor: null,
    };
  }

  return {
    items: payload?.items || [],
    has_more: Boolean(payload?.has_more),
    next_cursor: payload?.next_cursor || null,
  };
};

export default function AIAssistantModal() {
  const user = useAuthStore((state) => state.user);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore((state) => state.conversations);
  const { t } = useI18n();
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [question, setQuestion] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyNextCursor, setHistoryNextCursor] = useState(null);
  const [asking, setAsking] = useState(false);
  const historyContainerRef = useRef(null);
  const historyEndRef = useRef(null);
  const restoreScrollHeightRef = useRef(null);
  const initialScrollDoneRef = useRef(false);

  const canUseAssistant = user?.role === "business" || user?.role === "employee";
  const activeConversation = conversations.find(
    (conversation) => String(conversation.id) === String(activeConversationId),
  );
  const activeCustomerName =
    activeConversation?.contact?.display_name ||
    activeConversation?.contact?.visitor_email ||
    activeConversation?.contact?.visitor_phone ||
    activeConversation?.contact?.platform_user_id ||
    t("chat.unknown");

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await client.get("/api/ai-assistant/history", {
        params: { limit: HISTORY_PAGE_SIZE },
      });
      const page = normalizeHistoryPage(res.data);
      setHistory(page.items);
      setHistoryHasMore(page.has_more);
      setHistoryNextCursor(page.next_cursor);
    } catch (err) {
      message.error(err.response?.data?.detail || t("aiAssistant.historyError"));
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadOlderHistory = async () => {
    if (loadingHistory || loadingOlderHistory || !historyHasMore || !historyNextCursor) return;

    const container = historyContainerRef.current;
    restoreScrollHeightRef.current = container?.scrollHeight ?? null;
    setLoadingOlderHistory(true);
    try {
      const res = await client.get("/api/ai-assistant/history", {
        params: { limit: HISTORY_PAGE_SIZE, before: historyNextCursor },
      });
      const page = normalizeHistoryPage(res.data);
      setHistory((items) => {
        const existingIds = new Set(items.map((item) => String(item.id)));
        const olderItems = page.items.filter((item) => !existingIds.has(String(item.id)));
        return [...olderItems, ...items];
      });
      setHistoryHasMore(page.has_more);
      setHistoryNextCursor(page.next_cursor);
    } catch (err) {
      restoreScrollHeightRef.current = null;
      message.error(err.response?.data?.detail || t("aiAssistant.historyError"));
    } finally {
      setLoadingOlderHistory(false);
    }
  };

  const handleHistoryScroll = () => {
    const container = historyContainerRef.current;
    if (!container || loadingHistory || loadingOlderHistory || !historyHasMore) return;

    if (container.scrollTop <= 48) {
      loadOlderHistory();
    }
  };

  const openAssistant = () => {
    initialScrollDoneRef.current = false;
    setLoadingHistory(true);
    setOpen(true);
  };

  useEffect(() => {
    if (open) fetchHistory();
  }, [open]);

  useLayoutEffect(() => {
    if (!open || loadingHistory) return;

    if (restoreScrollHeightRef.current != null) {
      const previousScrollHeight = restoreScrollHeightRef.current;
      const frameId = window.requestAnimationFrame(() => {
        const container = historyContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight - previousScrollHeight;
        }
        restoreScrollHeightRef.current = null;
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    historyEndRef.current?.scrollIntoView({
      behavior: initialScrollDoneRef.current ? "smooth" : "auto",
    });
    initialScrollDoneRef.current = true;
  }, [open, loadingHistory, history, asking]);

  const submitAssistantQuestion = async (submittedQuestion, intent = "ask", onError) => {
    const trimmedQuestion = submittedQuestion.trim();
    if (!trimmedQuestion || asking) return;
    setAsking(true);
    try {
      const res = await client.post("/api/ai-assistant/ask", {
        question: trimmedQuestion,
        conversation_id: activeConversationId || undefined,
        intent,
      });
      setHistory((items) => [...items, res.data.user_message, res.data.assistant_message]);
    } catch (err) {
      message.error(err.response?.data?.detail || t("aiAssistant.askError"));
      onError?.();
    } finally {
      setAsking(false);
    }
  };

  const askAssistant = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || asking) return;

    setQuestion("");
    submitAssistantQuestion(trimmedQuestion, "ask", () => setQuestion(trimmedQuestion));
  };

  const summarizeActiveConversation = () => {
    if (!activeConversationId || asking) return;

    submitAssistantQuestion(
      t("aiAssistant.summaryPrompt", { customer: activeCustomerName }),
      "summarize_conversation",
    );
  };

  if (!canUseAssistant) return null;

  return (
    <>
      <Tooltip title={t("aiAssistant.title")}>
        <Button icon={<RobotOutlined />} onClick={openAssistant}>
          {t("aiAssistant.button")}
        </Button>
      </Tooltip>
      <Modal
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <RobotOutlined />
            {t("aiAssistant.title")}
          </span>
        }
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        centered
        width={720}
        destroyOnClose={false}
      >
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          {activeConversationId ? t("aiAssistant.activeConversationHint") : t("aiAssistant.generalHint")}
        </Typography.Text>
        <div
          ref={historyContainerRef}
          onScroll={handleHistoryScroll}
          style={{
            height: 440,
            overflowY: "auto",
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 8,
            padding: 16,
            background: token.colorFillQuaternary,
          }}
        >
          {loadingHistory ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
              <Spin />
            </div>
          ) : history.length === 0 ? (
            <Empty description={t("aiAssistant.empty")} style={{ marginTop: 80 }} />
          ) : (
            <>
              {loadingOlderHistory && (
                <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 12px" }}>
                  <Spin size="small" />
                </div>
              )}
              {history.map((item) => {
                const isAssistant = item.role === "assistant";
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 14,
                      flexDirection: isAssistant ? "row" : "row-reverse",
                    }}
                  >
                    <Avatar
                      icon={isAssistant ? <RobotOutlined /> : <UserOutlined />}
                      style={{ background: isAssistant ? token.colorPrimary : token.colorInfo }}
                    />
                    <div
                      style={{
                        maxWidth: "78%",
                        padding: "9px 12px",
                        borderRadius: 10,
                        background: isAssistant ? token.colorBgContainer : token.colorPrimaryBg,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <MessageMarkdown>{item.content}</MessageMarkdown>
                    </div>
                  </div>
                );
              })}
            </>
          )}
          {asking && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar icon={<RobotOutlined />} style={{ background: token.colorPrimary }} />
              <Spin size="small" />
              <Typography.Text type="secondary">{t("aiAssistant.thinking")}</Typography.Text>
            </div>
          )}
          <div ref={historyEndRef} />
        </div>
        {activeConversationId && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Button
              icon={<FileTextOutlined />}
              onClick={summarizeActiveConversation}
              disabled={asking}
              style={{
                borderStyle: "dashed",
                borderRadius: 999,
                maxWidth: "100%",
                whiteSpace: "normal",
                height: "auto",
                minHeight: 32,
                textAlign: "left",
              }}
            >
              {t("aiAssistant.summaryAction", { customer: activeCustomerName })}
            </Button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Input.TextArea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("aiAssistant.placeholder")}
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                askAssistant();
              }
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={askAssistant}
            loading={asking}
            disabled={!question.trim()}
          >
            {t("aiAssistant.ask")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
