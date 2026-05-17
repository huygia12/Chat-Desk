import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  DeleteOutlined,
  FacebookOutlined,
  InstagramOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import client from "../api/client";
import WidgetManager from "../components/WidgetManager";
import { useI18n } from "../i18n/useI18n";
import { useChannelStore } from "../store/channelStore";

function MetaIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "inline-block", verticalAlign: "-0.125em" }}
    >
      <path
        d="M3.5 12.1C4.9 7.4 7.1 5 9.5 5c1.5 0 2.8.9 4.1 2.5.3.4.6.8.9 1.3.3-.5.6-.9.9-1.3C16.7 5.9 18 5 19.5 5c2.4 0 4.2 2.1 4.2 5.2 0 3.4-1.9 6.8-4.7 6.8-1.7 0-3.1-1.2-4.5-3.2-.1-.2-.3-.4-.4-.6-.2.3-.4.6-.6.9C12.1 16.1 10.7 17 9 17c-3 0-5.5-1.6-5.5-4.9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 12.3C6.3 9.5 7.6 7 9.3 7c1.2 0 2.2 1.4 3.6 3.6l1.2 1.9c1.5 2.2 2.8 3.4 4.5 3.4 1.9 0 3.1-2.4 3.1-5.2C21.7 8.4 20.8 7 19.5 7c-1.2 0-2.2 1.2-3.6 3.4l-1.3 2.1C12.9 15.1 11.5 17 9 17c-2.1 0-3.6-1-3.6-4.7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "inline-block", verticalAlign: "-0.125em" }}
    >
      <path
        d="M21.5 4.5 18.2 20c-.2 1-1 1.2-1.8.7l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.6 13.2l-5-1.6c-1.1-.3-1.1-1.1.2-1.6L20.3 2.5c.9-.3 1.7.2 1.2 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Channels() {
  const {
    channels,
    loading,
    fetchChannels,
    connectTelegram,
    disconnectChannel,
  } = useChannelStore();

  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramLoading, setTelegramLoading] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    fetchChannels();

    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success) {
      const pages = params.get("pages");
      const instagram = params.get("instagram");
      const detail =
        pages != null && instagram != null
          ? ` (${pages} Facebook Page, ${instagram} Instagram)`
          : "";
      message.success(t("channels.metaSuccess", { detail }));
      fetchChannels();
      window.history.replaceState({}, "", "/channels");
    } else if (error) {
      if (error === "no_pages") {
        message.error(
          t("channels.noPages"),
        );
      } else {
        message.error(t("channels.metaError", { error }));
      }
      window.history.replaceState({}, "", "/channels");
    }
  }, [fetchChannels, t]);

  const handleConnectOAuth = async () => {
    try {
      const res = await client.get("/api/channels/facebook/oauth");
      window.location.href = res.data.url;
    } catch (err) {
      message.error(
        t("channels.oauthError", { reason: err.response?.data?.detail || err.message }),
      );
    }
  };

  const handleConnectTelegram = async () => {
    if (!telegramToken.trim()) {
      message.error(t("channels.botTokenRequired"));
      return;
    }

    setTelegramLoading(true);
    try {
      await connectTelegram(telegramToken.trim());
      message.success(t("channels.telegramSuccess"));
      setTelegramModalOpen(false);
      setTelegramToken("");
    } catch (err) {
      message.error(err.response?.data?.detail || t("channels.telegramError"));
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleDisconnect = async (channelId) => {
    try {
      await disconnectChannel(channelId);
      message.success(t("channels.disconnectSuccess"));
    } catch {
      message.error(t("channels.disconnectError"));
    }
  };

  const columns = [
    {
      title: t("channels.platform"),
      dataIndex: "platform",
      render: (value) => {
        if (value === "facebook") {
          return (
            <Tag icon={<FacebookOutlined />} color="blue">
              Facebook
            </Tag>
          );
        }
        if (value === "instagram") {
          return (
            <Tag icon={<InstagramOutlined />} color="magenta">
              Instagram
            </Tag>
          );
        }
        if (value === "telegram") {
          return (
            <Tag icon={<TelegramIcon />} color="cyan">
              Telegram
            </Tag>
          );
        }
        return <Tag>{value}</Tag>;
      },
    },
    { title: t("channels.channelName"), dataIndex: "page_name", render: (value) => value || "-" },
    {
      title: "Platform ID",
      dataIndex: "platform_page_id",
      render: (value) => <Typography.Text copyable>{value}</Typography.Text>,
    },
    {
      title: t("common.status"),
      dataIndex: "is_active",
      render: (value) =>
        value ? <Tag color="green">{t("channels.enabled")}</Tag> : <Tag color="red">{t("channels.disabled")}</Tag>,
    },
    {
      title: t("channels.connectedAt"),
      dataIndex: "created_at",
      render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: t("common.actions"),
      render: (_, record) => (
        <Popconfirm
          title={t("channels.disconnectTitle")}
          onConfirm={() => handleDisconnect(record.id)}
          okText={t("common.confirm")}
          cancelText={t("common.cancel")}
        >
          <Button danger icon={<DeleteOutlined />} size="small">
            {t("channels.disconnectButton")}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={t("channels.title")}
        extra={
          <Space wrap>
            <Button type="primary" icon={<MetaIcon />} onClick={() => setMetaModalOpen(true)}>
              {t("channels.connectMeta")}
            </Button>
            <Button
              icon={<TelegramIcon />}
              onClick={() => setTelegramModalOpen(true)}
              style={{ borderColor: "#0088cc", color: "#0088cc" }}
            >
              {t("channels.connectTelegram")}
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={channels}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: t("channels.empty") }}
        />
      </Card>

      <WidgetManager embedded />

      <Modal
        title={t("channels.connectMeta")}
        open={metaModalOpen}
        onCancel={() => setMetaModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setMetaModalOpen(false)}>
            {t("common.cancel")}
          </Button>,
          <Button key="continue" type="primary" icon={<MetaIcon />} onClick={handleConnectOAuth}>
            {t("common.continue")}
          </Button>,
        ]}
      >
        <Alert
          message={t("channels.metaInfo")}
          description={t("channels.metaDescription")}
          type="info"
          showIcon
        />
      </Modal>

      <Modal
        title={t("channels.telegramTitle")}
        open={telegramModalOpen}
        onOk={handleConnectTelegram}
        onCancel={() => {
          setTelegramModalOpen(false);
          setTelegramToken("");
        }}
        okText={t("channels.connectTelegram").replace("Telegram", "").trim() || t("common.confirm")}
        cancelText={t("common.cancel")}
        confirmLoading={telegramLoading}
      >
        <Alert
          message={t("channels.tokenGuide")}
          description={
            <ol style={{ paddingLeft: 20, margin: "8px 0 0" }}>
              <li>{t("channels.telegramStep1")}</li>
              <li>{t("channels.telegramStep2")}</li>
              <li>{t("channels.telegramStep3")}</li>
            </ol>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea
          placeholder={t("channels.botTokenPlaceholder")}
          rows={2}
          value={telegramToken}
          onChange={(event) => setTelegramToken(event.target.value)}
        />
      </Modal>
    </div>
  );
}
