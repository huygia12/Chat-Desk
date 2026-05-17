import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
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
  LinkOutlined,
  PlusOutlined,
  SendOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";
import { useChannelStore } from "../store/channelStore";

export default function Channels() {
  const {
    channels,
    loading,
    fetchChannels,
    connectFacebook,
    connectInstagram,
    connectTelegram,
    disconnectChannel,
  } = useChannelStore();

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [platform, setPlatform] = useState("facebook");
  const [form] = Form.useForm();
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

  const handleManualConnect = async () => {
    try {
      const values = await form.validateFields();
      if (platform === "facebook") {
        await connectFacebook(values);
      } else {
        await connectInstagram(values);
      }
      message.success(t("channels.manualSuccess", { platform }));
      setManualModalOpen(false);
      form.resetFields();
    } catch (err) {
      message.error(err.response?.data?.detail || t("channels.connectError"));
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
            <Tag icon={<SendOutlined />} color="cyan">
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
      title: "",
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
            <Button type="primary" icon={<LinkOutlined />} onClick={handleConnectOAuth}>
              {t("channels.connectMeta")}
            </Button>
            <Button
              icon={<SendOutlined />}
              onClick={() => setTelegramModalOpen(true)}
              style={{ borderColor: "#0088cc", color: "#0088cc" }}
            >
              {t("channels.connectTelegram")}
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setManualModalOpen(true)}>
              {t("channels.manualToken")}
            </Button>
          </Space>
        }
      >
        <Alert
          message={t("channels.metaInfo")}
          description={t("channels.metaDescription")}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          dataSource={channels}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: t("channels.empty") }}
        />
      </Card>

      <Modal
        title={t("channels.manualTitle")}
        open={manualModalOpen}
        onOk={handleManualConnect}
        onCancel={() => {
          setManualModalOpen(false);
          form.resetFields();
        }}
        okText={t("channels.connectMeta").replace("Meta", "").trim() || t("common.confirm")}
        cancelText={t("common.cancel")}
      >
        <Alert
          message={t("channels.manualWarning")}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text>{t("channels.choosePlatform")}</Typography.Text>
            <Select
              value={platform}
              onChange={setPlatform}
              style={{ width: "100%", marginTop: 8 }}
              options={[
                { label: "Facebook Page", value: "facebook" },
                { label: "Instagram Professional", value: "instagram" },
              ]}
            />
          </div>
          <Form form={form} layout="vertical">
            <Form.Item
              name="platform_page_id"
              label={platform === "instagram" ? "Instagram Account ID" : "Facebook Page ID"}
              rules={[{ required: true, message: t("channels.platformIdRequired") }]}
            >
              <Input
                placeholder={
                  platform === "instagram"
                    ? t("channels.instagramIdPlaceholder")
                    : t("channels.facebookIdPlaceholder")
                }
              />
            </Form.Item>
            <Form.Item name="page_name" label={t("channels.displayName")}>
              <Input placeholder={t("channels.displayNamePlaceholder")} />
            </Form.Item>
            <Form.Item
              name="access_token"
              label="Page Access Token"
              rules={[{ required: true, message: t("channels.tokenRequired") }]}
            >
              <Input.TextArea
                placeholder={t("channels.tokenPlaceholder")}
                rows={3}
              />
            </Form.Item>
          </Form>
        </Space>
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
