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
import dayjs from 'dayjs'

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [importing, setImporting] = useState(false)
  const [form] = Form.useForm()

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await client.get('/api/products')
      setProducts(res.data)
    } catch (err) {
      message.error('Lỗi tải danh sách sản phẩm')
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
        message.success('Cập nhật sản phẩm thành công')
      } else {
        await client.post('/api/products', values)
        message.success('Thêm sản phẩm thành công')
      }
      setModalOpen(false)
      setEditingProduct(null)
      form.resetFields()
      fetchProducts()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Thao tác thất bại')
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
      message.success('Xóa sản phẩm thành công')
      fetchProducts()
    } catch {
      message.error('Xóa thất bại')
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
          message.warning('File JSON không có sản phẩm')
          return
        }
        await client.post('/api/products/import', products)
        message.success(`Import thành công ${products.length} sản phẩm`)
        fetchProducts()
      } catch (err) {
        message.error(err.response?.data?.detail || 'Import thất bại, kiểm tra lại file JSON')
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }

  const columns = [
    { title: 'Tên sản phẩm', dataIndex: 'name', ellipsis: true },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: 'Giá (VND)',
      dataIndex: 'price',
      render: (v) => (v != null ? Number(v).toLocaleString('vi-VN') : '-'),
      width: 140,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (v) =>
        v === 'available' ? (
          <Tag color="green">Còn hàng</Tag>
        ) : (
          <Tag color="red">Hết hàng</Tag>
        ),
    },
    {
      title: 'Cập nhật',
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
          <Popconfirm title="Xóa sản phẩm này?" onConfirm={() => handleDelete(record.id)}>
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={`Sản phẩm (${products.length})`}
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
              Thêm sản phẩm
            </Button>
          </div>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Thêm sản phẩm để AI có thể tự động trả lời khách hàng về giá cả, tình trạng hàng.
        </Typography.Text>
        <Table
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có sản phẩm nào' }}
        />
      </Card>

      <Modal
        title={editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false)
          setEditingProduct(null)
          form.resetFields()
        }}
        okText={editingProduct ? 'Cập nhật' : 'Thêm'}
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" initialValues={{ status: 'available' }}>
          <Form.Item
            name="name"
            label="Tên sản phẩm"
            rules={[{ required: true, message: 'Nhập tên sản phẩm' }]}
          >
            <Input placeholder="VD: Giày Nike Air Force 1" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả chi tiết">
            <Input.TextArea
              placeholder="Mô tả sản phẩm chi tiết để AI hiểu rõ hơn..."
              rows={3}
            />
          </Form.Item>
          <Form.Item name="price" label="Giá (VND)">
            <InputNumber
              style={{ width: '100%' }}
              placeholder="VD: 2500000"
              min={0}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/,/g, '')}
            />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái">
            <Select
              options={[
                { label: 'Còn hàng', value: 'available' },
                { label: 'Hết hàng', value: 'out_of_stock' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
