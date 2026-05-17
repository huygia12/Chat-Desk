import { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Typography,
  Tag,
  message,
  Popconfirm,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import dayjs from 'dayjs'

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [importing, setImporting] = useState(false)
  const [form] = Form.useForm()
  const { t } = useI18n()

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await client.get('/api/products')
      setProducts(res.data)
    } catch (err) {
      message.error(t('products.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingProduct) {
        await client.put(`/api/products/${editingProduct.id}`, values)
        message.success(t('products.updateSuccess'))
      } else {
        await client.post('/api/products', values)
        message.success(t('products.createSuccess'))
      }
      setModalOpen(false)
      setEditingProduct(null)
      form.resetFields()
      fetchProducts()
    } catch (err) {
      message.error(err.response?.data?.detail || t('products.actionError'))
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)
    form.setFieldsValue(product)
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    try {
      await client.delete(`/api/products/${id}`)
      message.success(t('products.deleteSuccess'))
      fetchProducts()
    } catch {
      message.error(t('products.deleteError'))
    }
  }

  const handleImportJSON = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      setImporting(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const products = Array.isArray(data) ? data : data.products || []
        if (products.length === 0) {
          message.warning(t('products.emptyJson'))
          return
        }
        await client.post('/api/products/import', products)
        message.success(t('products.importSuccess', { count: products.length }))
        fetchProducts()
      } catch (err) {
        message.error(err.response?.data?.detail || t('products.importError'))
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }

  const columns = [
    { title: t('products.productName'), dataIndex: 'name', ellipsis: true },
    {
      title: t('products.description'),
      dataIndex: 'description',
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: t('products.price'),
      dataIndex: 'price',
      render: (v) => (v != null ? Number(v).toLocaleString('vi-VN') : '-'),
      width: 140,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 120,
      render: (v) =>
        v === 'available' ? (
          <Tag color="green">{t('products.inStock')}</Tag>
        ) : (
          <Tag color="red">{t('products.outOfStock')}</Tag>
        ),
    },
    {
      title: t('common.updatedAt'),
      dataIndex: 'updated_at',
      width: 150,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '',
      width: 140,
      render: (_, record) => (
        <>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEdit(record)}
            style={{ marginRight: 8 }}
          />
          <Popconfirm title={t('products.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={`${t('products.title')} (${products.length})`}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              icon={<UploadOutlined />}
              onClick={handleImportJSON}
              loading={importing}
            >
              Import JSON
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingProduct(null)
                form.resetFields()
                setModalOpen(true)
              }}
            >
              {t('products.addProduct')}
            </Button>
          </div>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {t('products.helper')}
        </Typography.Text>
        <Table
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t('products.empty') }}
        />
      </Card>

      <Modal
        title={editingProduct ? t('products.editTitle') : t('products.addTitle')}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false)
          setEditingProduct(null)
          form.resetFields()
        }}
        okText={editingProduct ? t('common.update') : t('common.add')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" initialValues={{ status: 'available' }}>
          <Form.Item
            name="name"
            label={t('products.productName')}
            rules={[{ required: true, message: t('products.nameRequired') }]}
          >
            <Input placeholder={t('products.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('products.descriptionLabel')}>
            <Input.TextArea
              placeholder={t('products.descriptionPlaceholder')}
              rows={3}
            />
          </Form.Item>
          <Form.Item name="price" label={t('products.price')}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="VD: 2500000"
              min={0}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/,/g, '')}
            />
          </Form.Item>
          <Form.Item name="status" label={t('common.status')}>
            <Select
              options={[
                { label: t('products.inStock'), value: 'available' },
                { label: t('products.outOfStock'), value: 'out_of_stock' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
