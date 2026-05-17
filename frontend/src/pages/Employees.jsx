import { useState, useEffect } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Tag,
  Space,
  Typography,
  Popconfirm,
  message,
  Divider,
} from "antd";
import {
  PlusOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";

const { Title } = Typography;

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const { t } = useI18n();

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/employees");
      setEmployees(res.data);
    } catch {
      message.error(t("employees.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleCreate = async (values) => {
    setSubmitting(true);
    try {
      await client.post("/api/employees", values);
      message.success(t("employees.createSuccess"));
      setModalOpen(false);
      form.resetFields();
      fetchEmployees();
    } catch (err) {
      message.error(err.response?.data?.detail || t("employees.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (employee) => {
    setEditingEmployee(employee);
    profileForm.setFieldsValue({
      full_name: employee.full_name,
      email: employee.email,
    });
    passwordForm.resetFields();
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingEmployee(null);
    profileForm.resetFields();
    passwordForm.resetFields();
  };

  const handleUpdateProfile = async (values) => {
    if (!editingEmployee) return;
    setProfileSubmitting(true);
    try {
      await client.patch(`/api/employees/${editingEmployee.id}/profile`, values);
      message.success(t("employees.updateSuccess"));
      fetchEmployees();
    } catch (err) {
      message.error(err.response?.data?.detail || t("employees.updateError"));
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleUpdatePassword = async (values) => {
    if (!editingEmployee) return;
    setPasswordSubmitting(true);
    try {
      await client.patch(`/api/employees/${editingEmployee.id}/password`, {
        password: values.password,
      });
      message.success(t("employees.passwordSuccess"));
      passwordForm.resetFields();
    } catch (err) {
      message.error(err.response?.data?.detail || t("employees.passwordError"));
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleToggleStatus = async (employee) => {
    try {
      await client.patch(`/api/employees/${employee.id}`, {
        is_active: !employee.is_active,
      });
      message.success(
        employee.is_active ? t("employees.lockedSuccess") : t("employees.unlockedSuccess")
      );
      fetchEmployees();
    } catch {
      message.error(t("employees.actionError"));
    }
  };

  const handleDelete = async (id) => {
    try {
      await client.delete(`/api/employees/${id}`);
      message.success(t("employees.deleteSuccess"));
      fetchEmployees();
    } catch {
      message.error(t("employees.deleteError"));
    }
  };

  const columns = [
    {
      title: t("employees.fullName"),
      dataIndex: "full_name",
      key: "full_name",
      render: (name) => name || "—",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: t("common.status"),
      dataIndex: "is_active",
      key: "is_active",
      render: (active) =>
        active ? (
          <Tag color="green">{t("employees.active")}</Tag>
        ) : (
          <Tag color="red">{t("employees.locked")}</Tag>
        ),
    },
    {
      title: t("employees.createdAt"),
      dataIndex: "created_at",
      key: "created_at",
      render: (date) => new Date(date).toLocaleDateString("vi-VN"),
    },
    {
      title: t("common.actions"),
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            {t("common.edit")}
          </Button>
          <Button
            size="small"
            icon={record.is_active ? <LockOutlined /> : <UnlockOutlined />}
            onClick={() => handleToggleStatus(record)}
          >
            {record.is_active ? t("employees.lock") : t("employees.unlock")}
          </Button>
          <Popconfirm
            title={t("employees.deleteTitle")}
            description={t("employees.deleteDescription")}
            onConfirm={() => handleDelete(record.id)}
            okText={t("common.delete")}
            cancelText={t("common.cancel")}
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              {t("common.delete")}
            </Button>
          </Popconfirm>
        </Space>
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
          {t("employees.title")}
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          {t("employees.add")}
        </Button>
      </div>

      <Table
        dataSource={employees}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: t("employees.empty") }}
      />

      <Modal
        title={t("employees.createTitle")}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText={t("employees.createButton")}
        cancelText={t("common.cancel")}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="full_name"
            label={t("employees.fullName")}
            rules={[{ required: true, message: t("employees.fullNameRequired") }]}
          >
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label={t("employees.emailLogin")}
            rules={[
              { required: true, message: t("employees.emailRequired") },
              { type: "email", message: t("employees.emailInvalid") },
            ]}
          >
            <Input placeholder="nhanvien@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("employees.password")}
            rules={[
              { required: true, message: t("employees.passwordRequired") },
              { min: 6, message: t("employees.passwordMin") },
            ]}
          >
            <Input.Password placeholder={t("employees.tempPassword")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("employees.editTitle")}
        open={editModalOpen}
        onCancel={closeEditModal}
        footer={null}
        destroyOnClose
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {t("employees.basicInfo")}
        </Typography.Title>
        <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile}>
          <Form.Item
            name="full_name"
            label={t("employees.fullName")}
            rules={[{ required: true, message: t("employees.fullNameRequired") }]}
          >
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label={t("employees.emailLogin")}
            rules={[
              { required: true, message: t("employees.emailRequired") },
              { type: "email", message: t("employees.emailInvalid") },
            ]}
          >
            <Input placeholder="nhanvien@example.com" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={profileSubmitting}>
            {t("employees.saveInfo")}
          </Button>
        </Form>

        <Divider />

        <Typography.Title level={5}>{t("employees.changePassword")}</Typography.Title>
        <Form form={passwordForm} layout="vertical" onFinish={handleUpdatePassword}>
          <Form.Item
            name="password"
            label={t("employees.newPassword")}
            rules={[
              { required: true, message: t("employees.newPasswordRequired") },
              { min: 6, message: t("employees.passwordMin") },
            ]}
          >
            <Input.Password placeholder={t("employees.newPassword")} />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label={t("employees.confirmPassword")}
            dependencies={["password"]}
            rules={[
              { required: true, message: t("employees.confirmPasswordRequired") },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t("employees.passwordMismatch")));
                },
              }),
            ]}
          >
            <Input.Password placeholder={t("employees.confirmPassword")} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={passwordSubmitting}>
            {t("employees.changePassword")}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
