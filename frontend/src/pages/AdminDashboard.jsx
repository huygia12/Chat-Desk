import { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Typography,
  Row,
  Col,
  Statistic,
  Tag,
  message,
  Space,
} from 'antd'
import {
  ShopOutlined,
  TeamOutlined,
  MessageOutlined,
  ShoppingOutlined,
  LinkOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import client from '../api/client'
import dayjs from 'dayjs'

const { Title } = Typography

export default function AdminDashboard() {
  const [businesses, setBusinesses] = useState([])
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsRes, businessesRes] = await Promise.all([
        client.get('/api/admin/statistics'),
        client.get('/api/admin/businesses'),
      ])
      setStatistics(statsRes.data)
      setBusinesses(businessesRes.data)
    } catch (err) {
      message.error('Lỗi tải dữ liệu: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const columns = [
    {
      title: 'Tên doanh nghiệp',
      dataIndex: 'business_name',
      key: 'business_name',
      render: (name) => name || <i style={{ color: '#999' }}>Chưa đặt tên</i>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Ngày đăng ký',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Số kênh',
      dataIndex: 'channel_count',
      key: 'channel_count',
      align: 'center',
      render: (count) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: 'Số hội thoại',
      dataIndex: 'conversation_count',
      key: 'conversation_count',
      align: 'center',
      render: (count) => <Tag color="green">{count}</Tag>,
    },
    {
      title: 'Số sản phẩm',
      dataIndex: 'product_count',
      key: 'product_count',
      align: 'center',
      render: (count) => <Tag color="orange">{count}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      align: 'center',
      render: (active) =>
        active ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Active
          </Tag>
        ) : (
          <Tag color="default">Inactive</Tag>
        ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <TeamOutlined /> Admin Dashboard
      </Title>

      {/* Statistics Cards */}
      {statistics && (
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic
                title="Tổng doanh nghiệp"
                value={statistics.total_businesses}
                prefix={<ShopOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic
                title="Doanh nghiệp Active"
                value={statistics.active_businesses}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic
                title="Tổng kênh kết nối"
                value={statistics.total_channels}
                prefix={<LinkOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic
                title="Tổng hội thoại"
                value={statistics.total_conversations}
                prefix={<MessageOutlined />}
                valueStyle={{ color: '#13c2c2' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic
                title="Tổng tin nhắn"
                value={statistics.total_messages}
                prefix={<MessageOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic
                title="Tổng sản phẩm"
                value={statistics.total_products}
                prefix={<ShoppingOutlined />}
                valueStyle={{ color: '#fa541c' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Business List Table */}
      <Card
        title={
          <Space>
            <ShopOutlined />
            <span>Danh sách Doanh nghiệp</span>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={businesses}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} doanh nghiệp`,
          }}
        />
      </Card>
    </div>
  )
}
