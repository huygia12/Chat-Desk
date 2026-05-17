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
import { useI18n } from "../i18n/useI18n";
import dayjs from "dayjs";

export default function Widgets() {
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingWidget, setEditingWidget] = useState(null);
  const { t } = useI18n();

  const fetchWidgets = async () => {
    setLoading(true);
    try {
      const response = await client.get("/api/widgets/list");
      setWidgets(response.data || []);
    } catch (err) {
      message.error(
        t("widgets.loadError", { reason: err.response?.data?.detail || err.message }),
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
        message.error(t("widgets.originRequired"));
        return;
      }

      const response = await client.post("/api/widgets/create", {
        allowed_origins: origins,
        widget_name: values.widget_name || null,
      });

      message.success(t("widgets.createSuccess"));
      setWidgets([response.data, ...widgets]);
      setIsModalOpen(false);
      form.resetFields();
    } catch (err) {
      message.error(
        t("widgets.createError", { reason: err.response?.data?.detail || err.message }),
      );
    }
  };

  const handleDeleteWidget = async (widgetId) => {
    try {
      await client.delete(`/api/widgets/${widgetId}`);
      message.success(t("widgets.deleteSuccess"));
      setWidgets(widgets.filter((w) => w.widget_id !== widgetId));
    } catch (err) {
      message.error(
        t("widgets.deleteError", { reason: err.response?.data?.detail || err.message }),
      );
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    message.success(t("widgets.copied", { label }));
  };

  const columns = [
    {
      title: "Widget ID",
      dataIndex: "widget_id",
      key: "widget_id",
      render: (id) => (
        <Tooltip title={t("widgets.clickToCopy")}>
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
      title: t("widgets.name"),
      dataIndex: "page_name",
      key: "page_name",
      render: (name) => name || "Widget",
    },
    {
      title: t("widgets.origins"),
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
      title: t("common.status"),
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
      title: t("widgets.createdAt"),
      dataIndex: "created_at",
      key: "created_at",
      render: (date) => dayjs(date).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: t("common.actions"),
      key: "action",
      render: (_, record) => (
        <Space>
          <Tooltip title={t("widgets.copyEmbed")}>
            <Button
              type="primary"
              icon={<CopyOutlined />}
              size="small"
              onClick={() => {
                const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                const embedCode = `<script>
  window.ChatDeskWidget = {
    widgetId: '${record.widget_id}',
    widgetSecret: '${record.widget_secret}',
    businessName: '${record.page_name || 'Your Business'}',
    apiUrl: '${backendUrl}',
  };
</script>
<script src="${window.location.origin}/embed.js"></script>`;
                copyToClipboard(embedCode, "embed code");
              }}
            />
          </Tooltip>

          <Popconfirm
            title={t("widgets.deleteTitle")}
            description={t("widgets.deleteDescription")}
            onConfirm={() => handleDeleteWidget(record.widget_id)}
            okText={t("common.delete")}
            cancelText={t("common.cancel")}
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
            {t("widgets.createButton")}
          </Button>
        }
        loading={loading}
      >
        {widgets.length === 0 ? (
          <Empty description={t("widgets.empty")} />
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
        title={editingWidget ? t("widgets.updateTitle") : t("widgets.createTitle")}
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
            label={t("widgets.nameLabel")}
            name="widget_name"
            tooltip={t("widgets.nameTooltip")}
          >
            <Input placeholder="VD: Customer Support Widget" />
          </Form.Item>

          <Form.Item
            label="Allowed Origins"
            name="allowed_origins"
            rules={[
              {
                required: true,
                message: t("widgets.originRequired"),
              },
            ]}
            tooltip={t("widgets.originsTooltip")}
          >
            <Input.TextArea
              placeholder="https://example.com&#10;https://www.example.com&#10;https://app.example.com"
              rows={4}
            />
          </Form.Item>

          <Card size="small" title={t("widgets.guide")} type="inner">
            <p style={{ fontSize: "12px", color: "#666" }}>
              {t("widgets.guideStep1")}
              <br />
              {t("widgets.guideStep2")}
              <br />
              {t("widgets.guideStep3")}
              <br />
              {t("widgets.guideStep4")} <code>http://localhost:5173</code>
            </p>
          </Card>
        </Form>
      </Modal>
    </div>
  );
}
