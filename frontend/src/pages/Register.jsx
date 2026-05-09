import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, message } from 'antd'
import { UserOutlined, LockOutlined, ShopOutlined, PhoneOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/authStore'

export default function Register() {
  const [loading, setLoading] = useState(false)
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await register(values.email, values.password, values.business_name, values.phone)
      message.success('Đăng ký thành công!')
      navigate('/chat')
    } catch (err) {
      message.error(err.response?.data?.detail || 'Đăng ký thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 420 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', color: '#1890ff' }}>
          ChatDesk
        </Typography.Title>
        <Typography.Text
          type="secondary"
          style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}
        >
          Đăng ký tài khoản Doanh nghiệp
        </Typography.Text>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item
            name="business_name"
            rules={[{ required: true, message: 'Nhập tên doanh nghiệp' }]}
          >
            <Input prefix={<ShopOutlined />} placeholder="Tên doanh nghiệp" size="large" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, message: 'Nhập email' }]}>
            <Input prefix={<UserOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 6, message: 'Tối thiểu 6 ký tự' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" size="large" />
          </Form.Item>
          <Form.Item name="phone">
            <Input prefix={<PhoneOutlined />} placeholder="Số điện thoại (tùy chọn)" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Đăng ký
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
      </Card>
    </div>
  )
}
