import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, message } from 'antd'
import { UserOutlined, LockOutlined, ShopOutlined, PhoneOutlined } from '@ant-design/icons'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'

export default function Register() {
  const [loading, setLoading] = useState(false)
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()
  const { t } = useI18n()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await register(values.email, values.password, values.business_name, values.phone)
      message.success(t('auth.registerSuccess'))
      navigate('/chat')
    } catch (err) {
      message.error(err.response?.data?.detail || t('auth.registerFailed'))
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
          {t('auth.registerSubtitle')}
        </Typography.Text>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item
            name="business_name"
            rules={[{ required: true, message: t('auth.businessNameRequired') }]}
          >
            <Input prefix={<ShopOutlined />} placeholder={t('auth.businessNamePlaceholder')} size="large" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, message: t('auth.emailRequired') }]}>
            <Input prefix={<UserOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 6, message: t('auth.minPassword') }]}>
            <Input.Password prefix={<LockOutlined />} placeholder={t('auth.passwordPlaceholder')} size="large" />
          </Form.Item>
          <Form.Item name="phone">
            <Input prefix={<PhoneOutlined />} placeholder={t('auth.phonePlaceholder')} size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              {t('auth.registerButton')}
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          {t('auth.hasAccount')} <Link to="/login">{t('auth.loginButton')}</Link>
        </div>
      </Card>
    </div>
  )
}
