import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useI18n } from "../i18n/useI18n";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { t } = useI18n();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      message.success(t("auth.loginSuccess"));

      // Redirect based on role
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/chat");
      }
    } catch (err) {
      message.error(err.response?.data?.detail || t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f0f2f5",
      }}
    >
      <Card style={{ width: 400 }}>
        <Typography.Title
          level={3}
          style={{ textAlign: "center", color: "#1890ff" }}
        >
          ChatDesk
        </Typography.Title>
        <Typography.Text
          type="secondary"
          style={{ display: "block", textAlign: "center", marginBottom: 24 }}
        >
          {t("auth.loginSubtitle")}
        </Typography.Text>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item
            name="email"
            rules={[{ required: true, message: t("auth.emailRequired") }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: t("auth.passwordRequired"), min: 6 }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t("auth.passwordPlaceholder")}
              size="large"
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              {t("auth.loginButton")}
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: "center" }}>
          {t("auth.noAccount")} <Link to="/register">{t("auth.registerBusiness")}</Link>
        </div>
      </Card>
    </div>
  );
}
