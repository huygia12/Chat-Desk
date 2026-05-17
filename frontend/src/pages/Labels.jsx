import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Table, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import client from '../api/client'
import CustomerLabel from '../components/CustomerLabel'
import { useI18n } from '../i18n/useI18n'

const DEFAULT_COLOR = '#d6e400'

export default function Labels() {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const { t } = useI18n()

  const fetchLabels = async () => {
    setLoading(true)
    try {
      const res = await client.get('/api/labels')
      setLabels(res.data)
    } catch {
      message.error(t('labelsPage.loadError'))
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
        message.success(t('labelsPage.updateSuccess'))
      } else {
        await client.post('/api/labels', payload)
        message.success(t('labelsPage.createSuccess'))
      }
      setModalOpen(false)
      setEditingLabel(null)
      form.resetFields()
      fetchLabels()
    } catch (err) {
      if (err.errorFields) return
      message.error(err.response?.data?.detail || t('labelsPage.actionError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (labelId) => {
    try {
      await client.delete(`/api/labels/${labelId}`)
      message.success(t('labelsPage.deleteSuccess'))
      fetchLabels()
    } catch {
      message.error(t('labelsPage.deleteError'))
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
      title: t('labelsPage.color'),
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
      title: t('labelsPage.note'),
      dataIndex: 'internal_note',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: t('common.updatedAt'),
      dataIndex: 'updated_at',
      width: 150,
      render: (value) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: t('common.actions'),
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
            title={t('labelsPage.deleteTitle')}
            description={t('labelsPage.deleteDescription')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.delete')}
            cancelText={t('common.cancel')}
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
        title={`${t('labelsPage.title')} (${labels.length})`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {t('labelsPage.add')}
          </Button>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {t('labelsPage.helper')}
        </Typography.Text>
        <Table
          dataSource={labels}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t('labelsPage.empty') }}
        />
      </Card>

      <Modal
        title={editingLabel ? t('labelsPage.editTitle') : t('labelsPage.addTitle')}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false)
          setEditingLabel(null)
          form.resetFields()
        }}
        okText={editingLabel ? t('common.update') : t('labelsPage.createButton')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ color: DEFAULT_COLOR }}>
          <Form.Item
            name="name"
            label={t('labelsPage.name')}
            rules={[
              { required: true, message: t('labelsPage.nameRequired') },
              { max: 80, message: t('labelsPage.nameMax') },
            ]}
          >
            <Input placeholder="VD: Doing" />
          </Form.Item>
          <Form.Item name="color" label={t('labelsPage.colorLabel')} rules={[{ required: true }]}>
            <Input type="color" style={{ width: 72, height: 36, padding: 4 }} />
          </Form.Item>
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              {t('labelsPage.preview')}
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
              placeholder={t('labelsPage.notePlaceholder')}
              maxLength={1000}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
