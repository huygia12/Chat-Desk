import { useEffect, useState } from "react";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { useAuthStore } from "../store/authStore";
import client from "../api/client";
import { useI18n } from "../i18n/useI18n";

export default function Settings() {
  const { user, fetchUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { t } = useI18n();

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        business_name: user.business_name,
        business_description: user.business_description,
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

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <Card title={t("settings.title")}>
        <Typography.Text
          type="secondary"
          style={{ display: "block", marginBottom: 16 }}
        >
          {t("settings.helper")}
        </Typography.Text>
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
