import { useEffect } from "react";
import { Button, Divider, Form, Input, Typography, message } from "antd";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";
import { useAuthStore } from "../store/authStore";

const { Title } = Typography;

export default function EmployeeSettings() {
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const { t } = useI18n();

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
      message.success(t("employees.profileSuccess"));
    } catch (err) {
      message.error(err.response?.data?.detail || t("employees.profileError"));
    }
  };

  const handleUpdatePassword = async (values) => {
    try {
      await client.patch("/api/employees/me/password", {
        current_password: values.current_password,
        password: values.password,
      });
      passwordForm.resetFields();
      message.success(t("employees.ownPasswordSuccess"));
    } catch (err) {
      message.error(err.response?.data?.detail || t("employees.passwordError"));
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {t("employees.settingsTitle")}
      </Title>

      <Title level={5}>{t("employees.basicInfo")}</Title>
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
        <Button type="primary" htmlType="submit">
          {t("employees.saveInfo")}
        </Button>
      </Form>

      <Divider />

      <Title level={5}>{t("employees.changePassword")}</Title>
      <Form form={passwordForm} layout="vertical" onFinish={handleUpdatePassword}>
        <Form.Item
          name="current_password"
          label={t("employees.currentPassword")}
          rules={[{ required: true, message: t("employees.currentPasswordRequired") }]}
        >
          <Input.Password placeholder={t("employees.currentPassword")} />
        </Form.Item>
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
        <Button type="primary" htmlType="submit">
          {t("employees.changePassword")}
        </Button>
      </Form>
    </div>
  );
}
