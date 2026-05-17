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

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
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
