import { useEffect, useState } from "react";
import { Avatar, Button, Card, Form, Input, Space, Typography, Upload, message, theme } from "antd";
import { useAuthStore } from "../store/authStore";
import client from "../api/client";
import { useFileObjectUrl } from "../hooks/useFileObjectUrl";
import { useI18n } from "../i18n/useI18n";

export default function Settings() {
  const { user, fetchUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form] = Form.useForm();
  const { t } = useI18n();
  const { token } = theme.useToken();
  const avatarSrc = useFileObjectUrl(user?.avatar_url);

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        business_name: user.business_name,
        business_description: user.business_description,
        store_address: user.store_address,
        opening_hours: user.opening_hours,
        shipping_policy: user.shipping_policy,
        warranty_policy: user.warranty_policy,
        payment_methods: user.payment_methods,
        hotline: user.hotline,
        phone: user.phone,
      });
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      await client.put("/api/users/profile", values);
      await fetchUser();
      message.success(t("settings.updateSuccess"));
    } catch (err) {
      message.error(t("settings.updateError"));
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (file) => {
    if (!file.type?.startsWith("image/")) {
      message.error(t("settings.avatarFileTypeError"));
      return Upload.LIST_IGNORE;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await client.post("/api/users/profile/avatar", formData);
      await fetchUser();
      message.success(t("settings.avatarUploadSuccess"));
    } catch (err) {
      message.error(err.response?.data?.detail || t("settings.avatarUploadError"));
    } finally {
      setAvatarUploading(false);
    }

    return false;
  };

  const avatarInitial = (user?.business_name || user?.email || "C").trim().charAt(0).toUpperCase();
  const avatarRingStyle = {
    width: 86,
    height: 86,
    padding: 3,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #1677ff 0%, #13c2c2 48%, #52c41a 100%)",
    boxShadow: `0 0 0 1px ${token.colorBgContainer}, 0 8px 24px rgba(22, 119, 255, 0.22)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  };

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <Card title={t("settings.title")}>
        <Typography.Text
          type="secondary"
          style={{ display: "block", marginBottom: 16 }}
        >
          {t("settings.helper")}
        </Typography.Text>
        <Space align="center" size={16} style={{ marginBottom: 24 }}>
          <div style={avatarRingStyle}>
            <Avatar
              size={80}
              src={avatarSrc}
              style={{
                background: token.colorBgElevated,
                color: token.colorPrimary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}
            >
              {avatarInitial}
            </Avatar>
          </div>
          <div>
            <Typography.Text strong style={{ display: "block" }}>
              {t("settings.avatar")}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
              {t("settings.avatarHint")}
            </Typography.Text>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={handleAvatarUpload}
            >
              <Button loading={avatarUploading}>{t("settings.uploadAvatar")}</Button>
            </Upload>
          </div>
        </Space>
        <Form form={form} layout="vertical">
          <Form.Item label="Email">
            <Input value={user?.email} disabled />
          </Form.Item>
          <Form.Item
            name="business_name"
            label={t("settings.businessName")}
            rules={[{ required: true, message: t("settings.nameRequired") }]}
          >
            <Input placeholder={t("settings.namePlaceholder")} />
          </Form.Item>
          <Form.Item name="business_description" label={t("settings.description")}>
            <Input.TextArea
              placeholder={t("settings.descriptionPlaceholder")}
              rows={4}
            />
          </Form.Item>
          <Form.Item name="phone" label={t("settings.phone")}>
            <Input placeholder={t("settings.phonePlaceholder")} />
          </Form.Item>
          <Form.Item name="hotline" label={t("settings.hotline")}>
            <Input placeholder={t("settings.hotlinePlaceholder")} />
          </Form.Item>
          <Form.Item name="store_address" label={t("settings.storeAddress")}>
            <Input.TextArea placeholder={t("settings.storeAddressPlaceholder")} rows={2} />
          </Form.Item>
          <Form.Item name="opening_hours" label={t("settings.openingHours")}>
            <Input.TextArea placeholder={t("settings.openingHoursPlaceholder")} rows={2} />
          </Form.Item>
          <Form.Item name="shipping_policy" label={t("settings.shippingPolicy")}>
            <Input.TextArea placeholder={t("settings.shippingPolicyPlaceholder")} rows={3} />
          </Form.Item>
          <Form.Item name="warranty_policy" label={t("settings.warrantyPolicy")}>
            <Input.TextArea placeholder={t("settings.warrantyPolicyPlaceholder")} rows={3} />
          </Form.Item>
          <Form.Item name="payment_methods" label={t("settings.paymentMethods")}>
            <Input.TextArea placeholder={t("settings.paymentMethodsPlaceholder")} rows={2} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleSave} loading={loading}>
              {t("settings.save")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
