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
      message.success(`Ket noi Meta thanh cong${detail}`);
      fetchChannels();
      window.history.replaceState({}, "", "/channels");
    } else if (error) {
      if (error === "no_pages") {
        message.error(
          "Khong tim thay Facebook Page. Hay tao Page va lien ket Instagram Professional account truoc.",
        );
      } else {
        message.error(`Loi ket noi Meta: ${error}`);
      }
      window.history.replaceState({}, "", "/channels");
    }
  }, []);

  const handleConnectOAuth = async () => {
    try {
      const res = await client.get("/api/channels/facebook/oauth");
      window.location.href = res.data.url;
    } catch (err) {
      message.error(
        "Khong the khoi tao OAuth: " + (err.response?.data?.detail || err.message),
      );
    }
  };

  const handleConnectTelegram = async () => {
    if (!telegramToken.trim()) {
      message.error("Vui long nhap Bot Token");
      return;
    }

    setTelegramLoading(true);
    try {
      await connectTelegram(telegramToken.trim());
      message.success("Ket noi Telegram Bot thanh cong");
      setTelegramModalOpen(false);
      setTelegramToken("");
    } catch (err) {
      message.error(err.response?.data?.detail || "Ket noi Telegram that bai");
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
      message.success(`Ket noi ${platform} thanh cong`);
      setManualModalOpen(false);
      form.resetFields();
    } catch (err) {
      message.error(err.response?.data?.detail || "Ket noi that bai");
    }
  };

  const handleDisconnect = async (channelId) => {
    try {
      await disconnectChannel(channelId);
      message.success("Da ngat ket noi");
    } catch {
      message.error("Ngat ket noi that bai");
    }
  };

  const columns = [
    {
      title: "Nen tang",
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
    { title: "Ten kenh", dataIndex: "page_name", render: (value) => value || "-" },
    {
      title: "Platform ID",
      dataIndex: "platform_page_id",
      render: (value) => <Typography.Text copyable>{value}</Typography.Text>,
    },
    {
      title: "Trang thai",
      dataIndex: "is_active",
      render: (value) =>
        value ? <Tag color="green">Hoat dong</Tag> : <Tag color="red">Tat</Tag>,
    },
    {
      title: "Ngay ket noi",
      dataIndex: "created_at",
      render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "",
      render: (_, record) => (
        <Popconfirm
          title="Ngat ket noi kenh nay?"
          onConfirm={() => handleDisconnect(record.id)}
          okText="Dong y"
          cancelText="Huy"
        >
          <Button danger icon={<DeleteOutlined />} size="small">
            Ngat
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Kenh ket noi"
        extra={
          <Space wrap>
            <Button type="primary" icon={<LinkOutlined />} onClick={handleConnectOAuth}>
              Ket noi Meta
            </Button>
            <Button
              icon={<SendOutlined />}
              onClick={() => setTelegramModalOpen(true)}
              style={{ borderColor: "#0088cc", color: "#0088cc" }}
            >
              Ket noi Telegram
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setManualModalOpen(true)}>
              Nhap token thu cong
            </Button>
          </Space>
        }
      >
        <Alert
          message="Ket noi Meta se tu dong them Facebook Page va Instagram Professional account da lien ket voi Page."
          description="Instagram can Business hoac Creator account, da lien ket voi Facebook Page va da bat webhook messages trong Meta Developer."
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
          locale={{ emptyText: "Chua ket noi kenh nao" }}
        />
      </Card>

      <Modal
        title="Ket noi kenh thu cong"
        open={manualModalOpen}
        onOk={handleManualConnect}
        onCancel={() => {
          setManualModalOpen(false);
          form.resetFields();
        }}
        okText="Ket noi"
        cancelText="Huy"
      >
        <Alert
          message="Nen dung OAuth Meta truoc. Cach thu cong chi phu hop khi ban da co Page Access Token hop le."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text>Chon nen tang:</Typography.Text>
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
              rules={[{ required: true, message: "Nhap Platform ID" }]}
            >
              <Input
                placeholder={
                  platform === "instagram"
                    ? "Nhap Instagram Professional Account ID"
                    : "Nhap Facebook Page ID"
                }
              />
            </Form.Item>
            <Form.Item name="page_name" label="Ten hien thi (tuy chon)">
              <Input placeholder="Nhap ten hien thi" />
            </Form.Item>
            <Form.Item
              name="access_token"
              label="Page Access Token"
              rules={[{ required: true, message: "Nhap Page Access Token" }]}
            >
              <Input.TextArea
                placeholder="Dan Page Access Token co quyen messaging"
                rows={3}
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        title="Ket noi Telegram Bot"
        open={telegramModalOpen}
        onOk={handleConnectTelegram}
        onCancel={() => {
          setTelegramModalOpen(false);
          setTelegramToken("");
        }}
        okText="Ket noi"
        cancelText="Huy"
        confirmLoading={telegramLoading}
      >
        <Alert
          message="Cach lay Bot Token"
          description={
            <ol style={{ paddingLeft: 20, margin: "8px 0 0" }}>
              <li>Mo Telegram va tim @BotFather.</li>
              <li>Gui /newbot va lam theo huong dan.</li>
              <li>Copy Bot Token va dan vao o ben duoi.</li>
            </ol>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea
          placeholder="Dan Bot Token vao day, vi du: 7123456789:AAF..."
          rows={2}
          value={telegramToken}
          onChange={(event) => setTelegramToken(event.target.value)}
        />
      </Modal>
    </div>
  );
}
