import { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Tag,
  Tooltip,
  Divider,
  Copy,
  Popconfirm,
  Empty,
} from "antd";
import {
  PlusOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import client from "../api/client";
import dayjs from "dayjs";

export default function Widgets() {
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingWidget, setEditingWidget] = useState(null);

  const fetchWidgets = async () => {
    setLoading(true);
    try {
      const response = await client.get("/api/widgets/list");
      setWidgets(response.data || []);
    } catch (err) {
      message.error(
        "Lỗi tải widgets: " + (err.response?.data?.detail || err.message),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWidgets();
  }, []);

  const handleCreateWidget = async (values) => {
    try {
      const origins = values.allowed_origins
        .split("\n")
        .map((o) => o.trim())
        .filter((o) => o);

      if (origins.length === 0) {
        message.error("Vui lòng nhập ít nhất một allowed origin");
        return;
      }

      const response = await client.post("/api/widgets/create", {
        allowed_origins: origins,
      });

      message.success("Tạo widget thành công!");
      setWidgets([response.data, ...widgets]);
      setIsModalOpen(false);
      form.resetFields();
    } catch (err) {
      message.error(
        "Lỗi tạo widget: " + (err.response?.data?.detail || err.message),
      );
    }
  };

  const handleDeleteWidget = async (widgetId) => {
    try {
      await client.delete(`/api/widgets/${widgetId}`);
      message.success("Xóa widget thành công!");
      setWidgets(widgets.filter((w) => w.widget_id !== widgetId));
    } catch (err) {
      message.error(
        "Lỗi xóa widget: " + (err.response?.data?.detail || err.message),
      );
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép ${label}`);
  };

  const columns = [
    {
      title: "Widget ID",
      dataIndex: "widget_id",
      key: "widget_id",
      render: (id) => (
        <Tooltip title="Click để sao chép">
          <span
            style={{ cursor: "pointer", color: "#1890ff" }}
            onClick={() => copyToClipboard(id, "Widget ID")}
          >
            {id.substring(0, 12)}...
          </span>
        </Tooltip>
      ),
    },
    {
      title: "Tên",
      dataIndex: "page_name",
      key: "page_name",
      render: (name) => name || "Widget",
    },
    {
      title: "Origins",
      dataIndex: "allowed_origins",
      key: "allowed_origins",
      render: (origins) => {
        if (!origins) return "-";
        try {
          const list = JSON.parse(origins);
          return (
            <Tooltip title={list.join(", ")}>
              <Tag color="blue">{list.length} domain(s)</Tag>
            </Tooltip>
          );
        } catch {
          return "-";
        }
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "is_active",
      key: "is_active",
      align: "center",
      render: (active) =>
        active ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Active
          </Tag>
        ) : (
          <Tag color="default">Inactive</Tag>
        ),
    },
    {
      title: "Tạo lúc",
      dataIndex: "created_at",
      key: "created_at",
      render: (date) => dayjs(date).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Thao tác",
      key: "action",
      render: (_, record) => (
        <Space>
          <Tooltip title="Sao chép embed code">
            <Button
              type="primary"
              icon={<CopyOutlined />}
              size="small"
              onClick={() => {
                const embedCode = `<script>
  window.ChatDeskWidget = {
    widgetId: '${record.widget_id}',
    widgetSecret: '${record.widget_secret}',
    businessName: 'Your Business',
    apiUrl: '${window.location.origin}',
  };
</script>
<script src="${window.location.origin}/embed.js"></script>`;
                copyToClipboard(embedCode, "embed code");
              }}
            />
          </Tooltip>

          <Popconfirm
            title="Xóa widget"
            description="Bạn có chắc muốn xóa widget này không?"
            onConfirm={() => handleDeleteWidget(record.widget_id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button type="danger" icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <Card
        title="Widgets"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
          >
            Tạo Widget
          </Button>
        }
        loading={loading}
      >
        {widgets.length === 0 ? (
          <Empty description="Chưa có widget nào" />
        ) : (
          <Table
            columns={columns}
            dataSource={widgets}
            rowKey="widget_id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1000 }}
          />
        )}
      </Card>

      {/* Create Widget Modal */}
      <Modal
        title={editingWidget ? "Cập nhật Widget" : "Tạo Widget Mới"}
        open={isModalOpen}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setEditingWidget(null);
        }}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateWidget}
          initialValues={{
            allowed_origins: "https://example.com\nhttps://www.example.com",
          }}
        >
          <Form.Item
            label="Tên Widget (tùy chọn)"
            name="widget_name"
            tooltip="Tên để nhận diện widget của bạn"
          >
            <Input placeholder="VD: Customer Support Widget" />
          </Form.Item>

          <Form.Item
            label="Allowed Origins"
            name="allowed_origins"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập ít nhất một allowed origin",
              },
            ]}
            tooltip="Danh sách các domain được phép sử dụng widget (một dòng một domain)"
          >
            <Input.TextArea
              placeholder="https://example.com&#10;https://www.example.com&#10;https://app.example.com"
              rows={4}
            />
          </Form.Item>

          <Card size="small" title="Hướng dẫn" type="inner">
            <p style={{ fontSize: "12px", color: "#666" }}>
              1. Nhập các domain website của khách hàng (với https://)
              <br />
              2. Một domain một dòng
              <br />
              3. Widget chỉ hoạt động trên các domain được phép
              <br />
              4. Để test local, thêm: <code>http://localhost:5173</code>
            </p>
          </Card>
        </Form>
      </Modal>
    </div>
  );
}
