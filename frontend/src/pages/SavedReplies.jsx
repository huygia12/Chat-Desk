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
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import client from "../api/client";
import { useAuthStore } from "../store/authStore";

const { Title, Text } = Typography;

const visibilityLabel = {
  business: "Doanh nghiệp",
  personal: "Cá nhân",
};

export default function SavedReplies() {
  const user = useAuthStore((state) => state.user);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReply, setEditingReply] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const isBusiness = user?.role === "business";

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/saved-replies");
      setReplies(res.data);
    } catch {
      message.error("Không thể tải danh sách saved replies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
  }, []);

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
        message.success("Cập nhật template thành công");
      } else {
        await client.post("/api/saved-replies", {
          ...payload,
          visibility: isBusiness ? "business" : "personal",
        });
        message.success("Tạo template thành công");
      }
      closeModal();
      fetchReplies();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.detail || "Thao tác thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (replyId) => {
    try {
      await client.delete(`/api/saved-replies/${replyId}`);
      message.success("Đã xóa template");
      fetchReplies();
    } catch (err) {
      message.error(err.response?.data?.detail || "Xóa template thất bại");
    }
  };

  const canModify = (reply) => {
    if (isBusiness) return reply.visibility === "business";
    return reply.visibility === "personal" && reply.owner_id === user?.id;
  };

  const columns = [
    {
      title: "Tiêu đề",
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
      title: "Phạm vi",
      dataIndex: "visibility",
      width: 150,
      render: (visibility) => (
        <Tag color={visibility === "business" ? "blue" : "green"}>
          {visibilityLabel[visibility] || visibility}
        </Tag>
      ),
    },
    {
      title: "Nội dung",
      dataIndex: "content",
      ellipsis: true,
      render: (content) => content,
    },
    {
      title: "Thao tác",
      width: 150,
      render: (_, record) =>
        canModify(record) ? (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              Sửa
            </Button>
            <Popconfirm
              title="Xóa template này?"
              onConfirm={() => handleDelete(record.id)}
              okText="Đồng ý"
              cancelText="Hủy"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary">Chỉ sử dụng</Text>
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
          Saved Replies
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Thêm template
        </Button>
      </div>

      <Table
        dataSource={replies}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: "Chưa có template nào" }}
      />

      <Modal
        title={editingReply ? "Chỉnh sửa template" : "Thêm template"}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        okText={editingReply ? "Cập nhật" : "Tạo"}
        cancelText="Hủy"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="visibility" label="Phạm vi">
            <Select
              disabled
              options={[
                { value: "business", label: "Doanh nghiệp" },
                { value: "personal", label: "Cá nhân" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: "Nhập tiêu đề" }]}
          >
            <Input placeholder="VD: Báo giá vận chuyển" />
          </Form.Item>
          <Form.Item
            name="shortcut"
            label="Shortcut"
            rules={[
              { required: true, message: "Nhập shortcut" },
              {
                pattern: /^\/?[a-zA-Z0-9_-]+$/,
                message: "Chỉ dùng chữ, số, dấu gạch ngang hoặc gạch dưới",
              },
            ]}
          >
            <Input addonBefore="/" placeholder="shipping" />
          </Form.Item>
          <Form.Item
            name="content"
            label="Nội dung"
            rules={[{ required: true, message: "Nhập nội dung" }]}
          >
            <Input.TextArea rows={5} placeholder="Nội dung sẽ được chèn vào ô chat..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
