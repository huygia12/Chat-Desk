import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Table, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import client from '../api/client'
import CustomerLabel from '../components/CustomerLabel'

const DEFAULT_COLOR = '#d6e400'

export default function Labels() {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const fetchLabels = async () => {
    setLoading(true)
    try {
      const res = await client.get('/api/labels')
      setLabels(res.data)
    } catch {
      message.error('Không thể tải danh sách label')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLabels()
  }, [])

  const openCreateModal = () => {
    setEditingLabel(null)
    form.setFieldsValue({ name: '', color: DEFAULT_COLOR, internal_note: '' })
    setModalOpen(true)
  }

  const openEditModal = (label) => {
    setEditingLabel(label)
    form.setFieldsValue({
      name: label.name,
      color: label.color || DEFAULT_COLOR,
      internal_note: label.internal_note || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        internal_note: values.internal_note?.trim() || null,
      }
      if (editingLabel) {
        await client.put(`/api/labels/${editingLabel.id}`, payload)
        message.success('Cập nhật label thành công')
      } else {
        await client.post('/api/labels', payload)
        message.success('Tạo label thành công')
      }
      setModalOpen(false)
      setEditingLabel(null)
      form.resetFields()
      fetchLabels()
    } catch (err) {
      if (err.errorFields) return
      message.error(err.response?.data?.detail || 'Thao tác thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (labelId) => {
    try {
      await client.delete(`/api/labels/${labelId}`)
      message.success('Đã xóa label')
      fetchLabels()
    } catch {
      message.error('Xóa label thất bại')
    }
  }

  const watchedName = Form.useWatch('name', form)
  const watchedColor = Form.useWatch('color', form)

  const columns = [
    {
      title: 'Label',
      dataIndex: 'name',
      render: (_, record) => <CustomerLabel label={record} />,
    },
    {
      title: 'Màu',
      dataIndex: 'color',
      width: 150,
      render: (color) => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: color,
              border: '1px solid #d9d9d9',
              flex: '0 0 auto',
            }}
          />
          <span
            style={{
              display: 'inline-block',
              padding: '1px 6px',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              background: '#fafafa',
              color: '#111',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
              lineHeight: '20px',
              whiteSpace: 'nowrap',
            }}
          >
            {color}
          </span>
        </span>
      ),
    },
    {
      title: 'Internal note',
      dataIndex: 'internal_note',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: 'Cập nhật',
      dataIndex: 'updated_at',
      width: 150,
      render: (value) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '',
      width: 120,
      render: (_, record) => (
        <>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => openEditModal(record)}
            style={{ marginRight: 8 }}
          />
          <Popconfirm
            title="Xóa label này?"
            description="Label sẽ được gỡ khỏi các khách hàng đang dùng."
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={`Quản lý label (${labels.length})`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Thêm label
          </Button>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Tạo bộ label riêng để phân loại khách hàng trong hội thoại.
        </Typography.Text>
        <Table
          dataSource={labels}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có label nào' }}
        />
      </Card>

      <Modal
        title={editingLabel ? 'Chỉnh sửa label' : 'Thêm label mới'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false)
          setEditingLabel(null)
          form.resetFields()
        }}
        okText={editingLabel ? 'Cập nhật' : 'Tạo label'}
        cancelText="Hủy"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ color: DEFAULT_COLOR }}>
          <Form.Item
            name="name"
            label="Tên label"
            rules={[
              { required: true, message: 'Nhập tên label' },
              { max: 80, message: 'Tên label tối đa 80 ký tự' },
            ]}
          >
            <Input placeholder="VD: Doing" />
          </Form.Item>
          <Form.Item name="color" label="Màu label" rules={[{ required: true }]}>
            <Input type="color" style={{ width: 72, height: 36, padding: 4 }} />
          </Form.Item>
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Xem trước
            </Typography.Text>
            <CustomerLabel
              label={{
                name: watchedName || 'Label',
                color: watchedColor || DEFAULT_COLOR,
              }}
              closable
            />
          </div>
          <Form.Item name="internal_note" label="Internal note">
            <Input.TextArea
              rows={4}
              placeholder="Ghi chú nội bộ về cách dùng label này..."
              maxLength={1000}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
