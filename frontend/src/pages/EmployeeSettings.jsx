import { useEffect } from "react";
import { Button, Divider, Form, Input, Typography, message } from "antd";
import client from "../api/client";
import { useAuthStore } from "../store/authStore";

const { Title } = Typography;

export default function EmployeeSettings() {
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    profileForm.setFieldsValue({
      full_name: user?.full_name,
      email: user?.email,
    });
  }, [user, profileForm]);

  const handleUpdateProfile = async (values) => {
    try {
      await client.patch("/api/employees/me/profile", values);
      await fetchUser();
      message.success("Cập nhật thông tin thành công");
    } catch (err) {
      message.error(err.response?.data?.detail || "Cập nhật thông tin thất bại");
    }
  };

  const handleUpdatePassword = async (values) => {
    try {
      await client.patch("/api/employees/me/password", {
        current_password: values.current_password,
        password: values.password,
      });
      passwordForm.resetFields();
      message.success("Đổi mật khẩu thành công");
    } catch (err) {
      message.error(err.response?.data?.detail || "Đổi mật khẩu thất bại");
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        Cài đặt
      </Title>

      <Title level={5}>Thông tin cơ bản</Title>
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
        <Button type="primary" htmlType="submit">
          Lưu thông tin
        </Button>
      </Form>

      <Divider />

      <Title level={5}>Đổi mật khẩu</Title>
      <Form form={passwordForm} layout="vertical" onFinish={handleUpdatePassword}>
        <Form.Item
          name="current_password"
          label="Mật khẩu hiện tại"
          rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại" }]}
        >
          <Input.Password placeholder="Mật khẩu hiện tại" />
        </Form.Item>
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
        <Button type="primary" htmlType="submit">
          Đổi mật khẩu
        </Button>
      </Form>
    </div>
  );
}
