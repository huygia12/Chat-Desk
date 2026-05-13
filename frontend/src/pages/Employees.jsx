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

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await client.get("/api/employees");
      setEmployees(res.data);
    } catch {
      message.error("Không thể tải danh sách nhân viên");
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
      message.success("Tạo tài khoản nhân viên thành công");
      setModalOpen(false);
      form.resetFields();
      fetchEmployees();
    } catch (err) {
      message.error(err.response?.data?.detail || "Tạo tài khoản thất bại");
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
      message.success("Cập nhật thông tin nhân viên thành công");
      fetchEmployees();
    } catch (err) {
      message.error(err.response?.data?.detail || "Cập nhật thông tin thất bại");
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
      message.success("Đổi mật khẩu nhân viên thành công");
      passwordForm.resetFields();
    } catch (err) {
      message.error(err.response?.data?.detail || "Đổi mật khẩu thất bại");
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
        employee.is_active ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản"
      );
      fetchEmployees();
    } catch {
      message.error("Thao tác thất bại");
    }
  };

  const handleDelete = async (id) => {
    try {
      await client.delete(`/api/employees/${id}`);
      message.success("Đã xóa tài khoản nhân viên");
      fetchEmployees();
    } catch {
      message.error("Xóa tài khoản thất bại");
    }
  };

  const columns = [
    {
      title: "Họ tên",
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
      title: "Trạng thái",
      dataIndex: "is_active",
      key: "is_active",
      render: (active) =>
        active ? (
          <Tag color="green">Hoạt động</Tag>
        ) : (
          <Tag color="red">Đã khóa</Tag>
        ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (date) => new Date(date).toLocaleDateString("vi-VN"),
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            Sửa
          </Button>
          <Button
            size="small"
            icon={record.is_active ? <LockOutlined /> : <UnlockOutlined />}
            onClick={() => handleToggleStatus(record)}
          >
            {record.is_active ? "Khóa" : "Mở khóa"}
          </Button>
          <Popconfirm
            title="Xác nhận xóa"
            description="Bạn có chắc muốn xóa tài khoản nhân viên này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Xóa
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
          Quản lý nhân viên
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          Thêm nhân viên
        </Button>
      </div>

      <Table
        dataSource={employees}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: "Chưa có nhân viên nào" }}
      />

      <Modal
        title="Tạo tài khoản nhân viên"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Tạo tài khoản"
        cancelText="Hủy"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="full_name"
            label="Họ tên"
            rules={[{ required: true, message: "Vui lòng nhập họ tên" }]}
          >
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email đăng nhập"
            rules={[
              { required: true, message: "Vui lòng nhập email" },
              { type: "email", message: "Email không hợp lệ" },
            ]}
          >
            <Input placeholder="nhanvien@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu" },
              { min: 6, message: "Mật khẩu tối thiểu 6 ký tự" },
            ]}
          >
            <Input.Password placeholder="Mật khẩu tạm thời" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Chỉnh sửa nhân viên"
        open={editModalOpen}
        onCancel={closeEditModal}
        footer={null}
        destroyOnClose
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Thông tin cơ bản
        </Typography.Title>
        <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile}>
          <Form.Item
            name="full_name"
            label="Họ tên"
            rules={[{ required: true, message: "Vui lòng nhập họ tên" }]}
          >
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email đăng nhập"
            rules={[
              { required: true, message: "Vui lòng nhập email" },
              { type: "email", message: "Email không hợp lệ" },
            ]}
          >
            <Input placeholder="nhanvien@example.com" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={profileSubmitting}>
            Lưu thông tin
          </Button>
        </Form>

        <Divider />

        <Typography.Title level={5}>Đổi mật khẩu</Typography.Title>
        <Form form={passwordForm} layout="vertical" onFinish={handleUpdatePassword}>
          <Form.Item
            name="password"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới" },
              { min: 6, message: "Mật khẩu tối thiểu 6 ký tự" },
            ]}
          >
            <Input.Password placeholder="Mật khẩu mới" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="Nhập lại mật khẩu mới"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Vui lòng nhập lại mật khẩu mới" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Mật khẩu nhập lại không khớp"));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Nhập lại mật khẩu mới" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={passwordSubmitting}>
            Đổi mật khẩu
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
