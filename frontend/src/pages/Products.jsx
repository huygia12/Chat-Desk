import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Checkbox,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
  Tag,
  message,
  Popconfirm,
  Popover,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  SearchOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import dayjs from 'dayjs'

const PRODUCT_COLUMN_STORAGE_KEY = 'chatdesk_product_visible_columns'
const PRODUCT_COLUMN_KEYS = [
  'name',
  'sku',
  'category',
  'description',
  'price',
  'stock_quantity',
  'status',
  'updated_at',
  'actions',
]

const getStoredProductColumns = () => {
  if (typeof window === 'undefined') return PRODUCT_COLUMN_KEYS

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRODUCT_COLUMN_STORAGE_KEY))
    const validColumns = Array.isArray(parsed)
      ? parsed.filter((key) => PRODUCT_COLUMN_KEYS.includes(key))
      : []
    return validColumns.length > 0 ? validColumns : PRODUCT_COLUMN_KEYS
  } catch {
    return PRODUCT_COLUMN_KEYS
  }
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [importing, setImporting] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllCount, setDeleteAllCount] = useState(null)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(getStoredProductColumns)
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    category: undefined,
    minPrice: null,
    maxPrice: null,
  })
  const [form] = Form.useForm()
  const { t } = useI18n()
  const visibleColumnKeySet = useMemo(() => new Set(visibleColumnKeys), [visibleColumnKeys])

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.search.trim() ||
          filters.status !== 'all' ||
          filters.category ||
          filters.minPrice != null ||
          filters.maxPrice != null,
      ),
    [filters],
  )

  const buildProductParams = (nextFilters = filters) => ({
    search: nextFilters.search.trim() || undefined,
    status: nextFilters.status !== 'all' ? nextFilters.status : undefined,
    category: nextFilters.category || undefined,
    min_price: nextFilters.minPrice ?? undefined,
    max_price: nextFilters.maxPrice ?? undefined,
  })

  const fetchProducts = async (nextFilters = filters) => {
    setLoading(true)
    try {
      const res = await client.get('/api/products', {
        params: buildProductParams(nextFilters),
      })
      setProducts(res.data)
      setCategoryOptions((current) => {
        const categories = res.data.map((product) => product.category).filter(Boolean)
        return [...new Set([...current, ...categories])].sort((a, b) => a.localeCompare(b))
      })
    } catch (err) {
      message.error(t('products.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const handleResetFilters = () => {
    const resetFilters = {
      search: '',
      status: 'all',
      category: undefined,
      minPrice: null,
      maxPrice: null,
    }
    setFilters(resetFilters)
    fetchProducts(resetFilters)
  }

  const updateVisibleColumns = (nextKeys) => {
    const normalizedKeys = PRODUCT_COLUMN_KEYS.filter((key) => nextKeys.includes(key))
    if (normalizedKeys.length === 0) return

    setVisibleColumnKeys(normalizedKeys)
    window.localStorage.setItem(PRODUCT_COLUMN_STORAGE_KEY, JSON.stringify(normalizedKeys))
  }

  const resetVisibleColumns = () => {
    setVisibleColumnKeys(PRODUCT_COLUMN_KEYS)
    window.localStorage.setItem(PRODUCT_COLUMN_STORAGE_KEY, JSON.stringify(PRODUCT_COLUMN_KEYS))
  }

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

  const handleDeleteAll = async () => {
    setDeletingAll(true)
    try {
      const res = await client.delete('/api/products')
      message.success(t('products.deleteAllSuccess', { count: res.data?.deleted_count ?? products.length }))
      setDeleteAllModalOpen(false)
      fetchProducts()
    } catch (err) {
      message.error(err.response?.data?.detail || t('products.deleteAllError'))
    } finally {
      setDeletingAll(false)
    }
  }

  const handleOpenDeleteAllModal = async () => {
    setDeleteAllModalOpen(true)
    setDeleteAllCount(products.length)
    try {
      const res = await client.get('/api/products')
      setDeleteAllCount(res.data.length)
    } catch {
      setDeleteAllCount(products.length)
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
    { key: 'name', title: t('products.productName'), dataIndex: 'name', ellipsis: true, width: 180 },
    {
      key: 'sku',
      title: t('products.sku'),
      dataIndex: 'sku',
      ellipsis: true,
      width: 120,
      render: (v) => v || '-',
    },
    {
      key: 'category',
      title: t('products.category'),
      dataIndex: 'category',
      ellipsis: true,
      width: 140,
      render: (v) => v || '-',
    },
    {
      key: 'description',
      title: t('products.description'),
      dataIndex: 'description',
      ellipsis: true,
      width: 220,
      render: (v) => v || '-',
    },
    {
      key: 'price',
      title: t('products.price'),
      dataIndex: 'price',
      render: (v) => (v != null ? Number(v).toLocaleString('vi-VN') : '-'),
      width: 140,
    },
    {
      key: 'stock_quantity',
      title: t('products.stockQuantity'),
      dataIndex: 'stock_quantity',
      width: 120,
      render: (v) => (v != null ? v : '-'),
    },
    {
      key: 'status',
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
      key: 'updated_at',
      title: t('common.updatedAt'),
      dataIndex: 'updated_at',
      width: 160,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      key: 'actions',
      title: t('common.actions'),
      width: 110,
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
  const visibleColumns = columns.filter((column) => visibleColumnKeySet.has(column.key))
  const columnOptions = columns.map((column) => ({
    label: column.title,
    value: column.key,
  }))
  const columnPicker = (
    <div style={{ width: 240 }}>
      <Checkbox.Group
        value={visibleColumnKeys}
        onChange={updateVisibleColumns}
        style={{ display: 'grid', gap: 8 }}
        options={columnOptions}
      />
      <Button size="small" type="link" onClick={resetVisibleColumns} style={{ padding: 0, marginTop: 10 }}>
        {t('products.resetColumns')}
      </Button>
    </div>
  )

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
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleOpenDeleteAllModal}
              disabled={products.length === 0 && !hasActiveFilters}
            >
              {t('products.deleteAllButton')}
            </Button>
          </div>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {t('products.helper')}
        </Typography.Text>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            onPressEnter={() => fetchProducts()}
            placeholder={t('products.searchPlaceholder')}
            style={{ width: 280 }}
          />
          <Select
            value={filters.status}
            onChange={(value) => updateFilter('status', value)}
            style={{ width: 160 }}
            options={[
              { label: t('products.allStatuses'), value: 'all' },
              { label: t('products.inStock'), value: 'available' },
              { label: t('products.outOfStock'), value: 'out_of_stock' },
            ]}
          />
          <Select
            showSearch
            value={filters.category || 'all'}
            onChange={(value) => updateFilter('category', value === 'all' ? undefined : value)}
            filterOption={(input, option) =>
              String(option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
            style={{ width: 190 }}
            options={[
              { label: t('products.allCategories'), value: 'all' },
              ...categoryOptions.map((category) => ({ label: category, value: category })),
            ]}
          />
          <InputNumber
            min={0}
            value={filters.minPrice}
            onChange={(value) => updateFilter('minPrice', value)}
            placeholder={t('products.minPrice')}
            formatter={(value) => `${value || ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value.replace(/,/g, '')}
            style={{ width: 150 }}
          />
          <InputNumber
            min={0}
            value={filters.maxPrice}
            onChange={(value) => updateFilter('maxPrice', value)}
            placeholder={t('products.maxPrice')}
            formatter={(value) => `${value || ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value.replace(/,/g, '')}
            style={{ width: 150 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchProducts()}>
            {t('common.search')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleResetFilters} disabled={!hasActiveFilters}>
            {t('products.resetFilters')}
          </Button>
          <Popover
            trigger="click"
            placement="bottomRight"
            title={t('products.visibleColumns')}
            content={columnPicker}
          >
            <Button icon={<SettingOutlined />}>{t('products.columns')}</Button>
          </Popover>
        </Space>
        <Table
          dataSource={products}
          columns={visibleColumns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1220 }}
          style={{ maxWidth: '100%' }}
          locale={{ emptyText: hasActiveFilters ? t('products.noFilteredProducts') : t('products.empty') }}
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
          <Form.Item name="sku" label={t('products.sku')}>
            <Input placeholder={t('products.skuPlaceholder')} />
          </Form.Item>
          <Form.Item name="category" label={t('products.category')}>
            <Input placeholder={t('products.categoryPlaceholder')} />
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
          <Form.Item name="stock_quantity" label={t('products.stockQuantity')}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="VD: 12"
              min={0}
              precision={0}
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

      <Modal
        title={t('products.deleteAllTitle')}
        open={deleteAllModalOpen}
        onOk={handleDeleteAll}
        onCancel={() => setDeleteAllModalOpen(false)}
        okText={t('products.deleteAllConfirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true }}
        confirmLoading={deletingAll}
      >
        <Typography.Paragraph>
          {t('products.deleteAllDescription', { count: deleteAllCount ?? products.length })}
        </Typography.Paragraph>
        <Typography.Text type="danger">
          {t('products.deleteAllWarning')}
        </Typography.Text>
      </Modal>
    </div>
  )
}
