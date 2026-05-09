import { useEffect, useState } from "react";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { useAuthStore } from "../store/authStore";
import client from "../api/client";

export default function Settings() {
  const { user, fetchUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

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
      message.success("Cập nhật thông tin thành công");
    } catch (err) {
      message.error("Cập nhật thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <Card title="Thông tin Doanh nghiệp">
        <Typography.Text
          type="secondary"
          style={{ display: "block", marginBottom: 16 }}
        >
          Thông tin này sẽ được AI sử dụng làm ngữ cảnh khi trả lời khách hàng.
        </Typography.Text>
        <Form form={form} layout="vertical">
          <Form.Item label="Email">
            <Input value={user?.email} disabled />
          </Form.Item>
          <Form.Item
            name="business_name"
            label="Tên doanh nghiệp"
            rules={[{ required: true, message: "Nhập tên" }]}
          >
            <Input placeholder="VD: Shop Giày Sneaker ABC" />
          </Form.Item>
          <Form.Item name="business_description" label="Mô tả doanh nghiệp">
            <Input.TextArea
              placeholder="Mô tả ngắn về doanh nghiệp để AI hiểu ngữ cảnh... (VD: Chuyên bán giày sneaker chính hãng, ship toàn quốc)"
              rows={4}
            />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại">
            <Input placeholder="Số điện thoại liên hệ" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleSave} loading={loading}>
              Lưu thay đổi
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
