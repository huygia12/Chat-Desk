import { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Typography,
  Tag,
  message,
  Popconfirm,
  Space,
  Alert,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  FacebookOutlined,
  InstagramOutlined,
  LinkOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useChannelStore } from "../store/channelStore";
import { useAuthStore } from "../store/authStore";
import client from "../api/client";
import dayjs from "dayjs";

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
  const token = useAuthStore((s) => s.token);
  const [modalOpen, setModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [platform, setPlatform] = useState("facebook");
  const [form] = Form.useForm();

  useEffect(() => {
    fetchChannels();

    // Check for OAuth callback success/error
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      message.success("Kết nối Facebook thành công!");
      fetchChannels();
      window.history.replaceState({}, "", "/channels");
    } else if (params.get("error")) {
      const error = params.get("error");
      if (error === "no_pages") {
        message.error(
          "Không tìm thấy Facebook Page nào. Vui lòng tạo Page trước.",
        );
      } else {
        message.error(`Lỗi: ${error}`);
      }
      window.history.replaceState({}, "", "/channels");
    }
  }, []);

  const handleConnectOAuth = async () => {
    try {
      const res = await client.get("/api/channels/facebook/oauth");
      window.open(res.data.url, "_blank");
    } catch (err) {
      message.error(
        "Lỗi khởi tạo OAuth: " + (err.response?.data?.detail || err.message),
      );
    }
  };

  const handleConnectTelegram = async () => {
    if (!telegramToken.trim()) {
      message.error("Vui lòng nhập Bot Token");
      return;
    }
    setTelegramLoading(true);
    try {
      await connectTelegram(telegramToken.trim());
      message.success("Kết nối Telegram Bot thành công!");
      setTelegramModalOpen(false);
      setTelegramToken("");
    } catch (err) {
      message.error(err.response?.data?.detail || "Kết nối Telegram thất bại");
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const values = await form.validateFields();
      if (platform === "facebook") {
        await connectFacebook(values);
      } else {
        await connectInstagram(values);
      }
      message.success(`Kết nối ${platform} thành công!`);
      setModalOpen(false);
      form.resetFields();
    } catch (err) {
      message.error(err.response?.data?.detail || "Kết nối thất bại");
    }
  };

  const handleDisconnect = async (channelId) => {
    try {
      await disconnectChannel(channelId);
      message.success("Đã ngắt kết nối");
    } catch {
      message.error("Ngắt kết nối thất bại");
    }
  };

  const columns = [
    {
      title: "Nền tảng",
      dataIndex: "platform",
      render: (p) =>
        p === "facebook" ? (
          <Tag icon={<FacebookOutlined />} color="blue">
            Facebook
          </Tag>
        ) : p === "instagram" ? (
          <Tag icon={<InstagramOutlined />} color="magenta">
            Instagram
          </Tag>
        ) : p === "telegram" ? (
          <Tag icon={<SendOutlined />} color="cyan">
            Telegram
          </Tag>
        ) : (
          <Tag>{p}</Tag>
        ),
    },
    { title: "Tên Page", dataIndex: "page_name", render: (v) => v || "-" },
    { title: "Page ID", dataIndex: "platform_page_id" },
    {
      title: "Trạng thái",
      dataIndex: "is_active",
      render: (v) =>
        v ? <Tag color="green">Hoạt động</Tag> : <Tag color="red">Tắt</Tag>,
    },
    {
      title: "Ngày kết nối",
      dataIndex: "created_at",
      render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "",
      render: (_, record) => (
        <Popconfirm
          title="Ngắt kết nối kênh này?"
          onConfirm={() => handleDisconnect(record.id)}
        >
          <Button danger icon={<DeleteOutlined />} size="small">
            Ngắt
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="Kênh kết nối"
        extra={
          <Space>
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={handleConnectOAuth}
            >
              Kết nối Facebook (OAuth)
            </Button>
            <Button
              icon={<SendOutlined />}
              onClick={() => setTelegramModalOpen(true)}
              style={{ borderColor: "#0088cc", color: "#0088cc" }}
            >
              Kết nối Telegram
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Nhập token thủ công
            </Button>
          </Space>
        }
      >
        <Alert
          message="Khuyến nghị: Dùng nút 'Kết nối Facebook (OAuth)' để tự động lấy token"
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
          locale={{ emptyText: "Chưa kết nối kênh nào" }}
        />
      </Card>

      <Modal
        title="Kết nối kênh thủ công"
        open={modalOpen}
        onOk={handleConnect}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        okText="Kết nối"
        cancelText="Hủy"
      >
        <Alert
          message="Chỉ dùng cách này nếu bạn đã có Page Access Token"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text>Chọn nền tảng:</Typography.Text>
            <Select
              value={platform}
              onChange={setPlatform}
              style={{ width: "100%", marginTop: 8 }}
              options={[
                { label: "Facebook Page", value: "facebook" },
                { label: "Instagram", value: "instagram" },
              ]}
            />
          </div>
          <Form form={form} layout="vertical">
            <Form.Item
              name="platform_page_id"
              label="Page ID"
              rules={[{ required: true, message: "Nhập Page ID" }]}
            >
              <Input placeholder="Nhập Facebook Page ID hoặc Instagram Account ID" />
            </Form.Item>
            <Form.Item name="page_name" label="Tên Page (tùy chọn)">
              <Input placeholder="Nhập tên hiển thị" />
            </Form.Item>
            <Form.Item
              name="access_token"
              label="Access Token"
              rules={[{ required: true, message: "Nhập Access Token" }]}
            >
              <Input.TextArea
                placeholder="Dán Page Access Token vào đây"
                rows={3}
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        title="Kết nối Telegram Bot"
        open={telegramModalOpen}
        onOk={handleConnectTelegram}
        onCancel={() => {
          setTelegramModalOpen(false);
          setTelegramToken("");
        }}
        okText="Kết nối"
        cancelText="Hủy"
        confirmLoading={telegramLoading}
      >
        <Alert
          message="Hướng dẫn lấy Bot Token"
          description={
            <ol style={{ paddingLeft: 20, margin: "8px 0 0" }}>
              <li>
                Mở Telegram, tìm <b>@BotFather</b>
              </li>
              <li>
                Gửi <code>/newbot</code> và làm theo hướng dẫn
              </li>
              <li>
                BotFather sẽ trả về một <b>Bot Token</b> (dạng:{" "}
                <code>123456:ABC-DEF...</code>)
              </li>
              <li>Copy token đó và dán vào ô bên dưới</li>
            </ol>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea
          placeholder="Dán Bot Token vào đây (vd: 7123456789:AAF...)"
          rows={2}
          value={telegramToken}
          onChange={(e) => setTelegramToken(e.target.value)}
        />
      </Modal>
    </div>
  );
}
