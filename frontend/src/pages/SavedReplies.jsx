import { useEffect, useState } from "react";
import {
  Button,
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
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";
import { useAuthStore } from "../store/authStore";

const { Title, Text } = Typography;

export default function SavedReplies() {
  const user = useAuthStore((state) => state.user);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReply, setEditingReply] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [form] = Form.useForm();
  const { t } = useI18n();

  const isBusiness = user?.role === "business";
  const visibilityLabel = {
    business: t("savedReplies.business"),
    personal: t("savedReplies.personal"),
  };

  const fetchReplies = async (nextSearch = search) => {
    setLoading(true);
    try {
      const res = await client.get("/api/saved-replies", {
        params: { search: nextSearch.trim() || undefined },
      });
      setReplies(res.data);
    } catch {
      message.error(t("savedReplies.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const handleResetSearch = () => {
    setSearch("");
    fetchReplies("");
  };

  const openCreateModal = () => {
    setEditingReply(null);
    form.setFieldsValue({
      title: "",
      shortcut: "",
      content: "",
      visibility: isBusiness ? "business" : "personal",
    });
    setModalOpen(true);
  };

  const openEditModal = (reply) => {
    setEditingReply(reply);
    form.setFieldsValue({
      title: reply.title,
      shortcut: reply.shortcut,
      content: reply.content,
      visibility: reply.visibility,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingReply(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      const payload = {
        title: values.title,
        shortcut: values.shortcut.replace(/^\//, ""),
        content: values.content,
      };
      if (editingReply) {
        await client.put(`/api/saved-replies/${editingReply.id}`, payload);
        message.success(t("savedReplies.updateSuccess"));
      } else {
        await client.post("/api/saved-replies", {
          ...payload,
          visibility: isBusiness ? "business" : "personal",
        });
        message.success(t("savedReplies.createSuccess"));
      }
      closeModal();
      fetchReplies();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.detail || t("savedReplies.actionError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (replyId) => {
    try {
      await client.delete(`/api/saved-replies/${replyId}`);
      message.success(t("savedReplies.deleteSuccess"));
      fetchReplies();
    } catch (err) {
      message.error(err.response?.data?.detail || t("savedReplies.deleteError"));
    }
  };

  const canModify = (reply) => {
    if (isBusiness) return reply.visibility === "business";
    return reply.visibility === "personal" && reply.owner_id === user?.id;
  };

  const columns = [
    {
      title: t("savedReplies.title"),
      dataIndex: "title",
      ellipsis: true,
    },
    {
      title: "Shortcut",
      dataIndex: "shortcut",
      width: 160,
      render: (shortcut) => <Text code>/{shortcut}</Text>,
    },
    {
      title: t("savedReplies.scope"),
      dataIndex: "visibility",
      width: 150,
      render: (visibility) => (
        <Tag color={visibility === "business" ? "blue" : "green"}>
          {visibilityLabel[visibility] || visibility}
        </Tag>
      ),
    },
    {
      title: t("savedReplies.content"),
      dataIndex: "content",
      ellipsis: true,
      render: (content) => content,
    },
    {
      title: t("common.actions"),
      width: 150,
      render: (_, record) =>
        canModify(record) ? (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              {t("common.edit")}
            </Button>
            <Popconfirm
              title={t("savedReplies.deleteTitle")}
              onConfirm={() => handleDelete(record.id)}
              okText={t("common.confirm")}
              cancelText={t("common.cancel")}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary">{t("savedReplies.readOnly")}</Text>
        ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          {t("savedReplies.pageTitle")}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          {t("savedReplies.add")}
        </Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onPressEnter={() => fetchReplies()}
          placeholder={t("savedReplies.searchPlaceholder")}
          style={{ width: 320 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchReplies()}>
          {t("common.search")}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={handleResetSearch} disabled={!search.trim()}>
          {t("savedReplies.resetSearch")}
        </Button>
      </Space>

      <Table
        dataSource={replies}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: search.trim() ? t("savedReplies.noFilteredReplies") : t("savedReplies.empty") }}
      />

      <Modal
        title={editingReply ? t("savedReplies.editTitle") : t("savedReplies.addTitle")}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        okText={editingReply ? t("common.update") : t("common.create")}
        cancelText={t("common.cancel")}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="visibility" label={t("savedReplies.scope")}>
            <Select
              disabled
              options={[
                { value: "business", label: t("savedReplies.business") },
                { value: "personal", label: t("savedReplies.personal") },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label={t("savedReplies.title")}
            rules={[{ required: true, message: t("savedReplies.titleRequired") }]}
          >
            <Input placeholder={t("savedReplies.titlePlaceholder")} />
          </Form.Item>
          <Form.Item
            name="shortcut"
            label="Shortcut"
            rules={[
              { required: true, message: t("savedReplies.shortcutRequired") },
              {
                pattern: /^\/?[a-zA-Z0-9_-]+$/,
                message: t("savedReplies.shortcutInvalid"),
              },
            ]}
          >
            <Input addonBefore="/" placeholder="shipping" />
          </Form.Item>
          <Form.Item
            name="content"
            label={t("savedReplies.content")}
            rules={[{ required: true, message: t("savedReplies.contentRequired") }]}
          >
            <Input.TextArea rows={5} placeholder={t("savedReplies.contentPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
