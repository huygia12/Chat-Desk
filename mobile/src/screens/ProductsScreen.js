import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import {
  ActivityIndicator,
  Appbar,
  Button,
  Dialog,
  IconButton,
  Portal,
  Searchbar,
  SegmentedButtons,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper'
import dayjs from 'dayjs'

import client from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

const emptyProductForm = {
  name: '',
  sku: '',
  category: '',
  description: '',
  price: '',
  stock_quantity: '',
  status: 'available',
}

const emptyFilters = {
  search: '',
  status: 'all',
  category: '',
  minPrice: '',
  maxPrice: '',
}

const parseOptionalNumber = (value) => {
  const normalized = String(value || '').replace(/,/g, '').trim()
  if (!normalized) return null
  const numberValue = Number(normalized)
  return Number.isFinite(numberValue) ? numberValue : NaN
}

const formatPrice = (value) => {
  if (value == null || value === '') return '-'
  return `${Number(value).toLocaleString('vi-VN')} VND`
}

export default function ProductsScreen({ navigation }) {
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [products, setProducts] = useState([])
  const [filters, setFilters] = useState(emptyFilters)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState(null)
  const [editingProduct, setEditingProduct] = useState(null)
  const [form, setForm] = useState(emptyProductForm)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [error, setError] = useState('')

  const isBusiness = user?.role === 'business'
  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.status !== 'all' ||
      filters.category.trim() ||
      filters.minPrice.trim() ||
      filters.maxPrice.trim(),
  )

  const buildParams = useCallback((nextFilters = filters) => ({
    search: nextFilters.search.trim() || undefined,
    status: nextFilters.status !== 'all' ? nextFilters.status : undefined,
    category: nextFilters.category.trim() || undefined,
    min_price: nextFilters.minPrice.trim() ? parseOptionalNumber(nextFilters.minPrice) : undefined,
    max_price: nextFilters.maxPrice.trim() ? parseOptionalNumber(nextFilters.maxPrice) : undefined,
  }), [filters])

  const fetchProducts = useCallback(async ({ nextFilters = filters, refresh = false } = {}) => {
    if (!isBusiness) return

    const params = buildParams(nextFilters)
    if (Number.isNaN(params.min_price) || Number.isNaN(params.max_price)) {
      setError('Gia loc khong hop le.')
      return
    }

    setError('')
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await client.get('/api/products', { params })
      setProducts(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Khong the tai danh sach san pham.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [buildParams, filters, isBusiness])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    if (!isBusiness) return undefined
    const timer = setTimeout(() => {
      fetchProducts({ nextFilters: filters })
    }, 350)
    return () => clearTimeout(timer)
  }, [fetchProducts, filters, isBusiness])

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const resetFilters = () => {
    setFilters(emptyFilters)
    fetchProducts({ nextFilters: emptyFilters, refresh: true })
  }

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const openCreateDialog = () => {
    setEditingProduct(null)
    setForm(emptyProductForm)
    setProductDialogOpen(true)
  }

  const openEditDialog = (product) => {
    setEditingProduct(product)
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      description: product.description || '',
      price: product.price != null ? String(Number(product.price)) : '',
      stock_quantity: product.stock_quantity != null ? String(product.stock_quantity) : '',
      status: product.status || 'available',
    })
    setProductDialogOpen(true)
  }

  const closeProductDialog = () => {
    setProductDialogOpen(false)
    setEditingProduct(null)
    setForm(emptyProductForm)
  }

  const validateForm = () => {
    const name = form.name.trim()
    const price = parseOptionalNumber(form.price)
    const stock = parseOptionalNumber(form.stock_quantity)

    if (!name) return 'Vui long nhap ten san pham.'
    if (Number.isNaN(price)) return 'Gia san pham khong hop le.'
    if (Number.isNaN(stock)) return 'So luong ton kho khong hop le.'
    if (stock != null && !Number.isInteger(stock)) return 'So luong ton kho phai la so nguyen.'
    return ''
  }

  const saveProduct = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    const price = parseOptionalNumber(form.price)
    const stock = parseOptionalNumber(form.stock_quantity)
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      price,
      stock_quantity: stock,
      status: form.status,
    }

    setSubmitting(true)
    setError('')
    try {
      if (editingProduct) {
        await client.put(`/api/products/${editingProduct.id}`, payload)
      } else {
        await client.post('/api/products', payload)
      }
      closeProductDialog()
      await fetchProducts({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Luu san pham that bai.')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteProduct = async () => {
    if (!productToDelete?.id) return

    setDeletingId(productToDelete.id)
    setError('')
    try {
      await client.delete(`/api/products/${productToDelete.id}`)
      setProductToDelete(null)
      await fetchProducts({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Xoa san pham that bai.')
    } finally {
      setDeletingId(null)
    }
  }

  const deleteAllProducts = async () => {
    setDeletingAll(true)
    setError('')
    try {
      await client.delete('/api/products')
      setDeleteAllDialogOpen(false)
      await fetchProducts({ nextFilters: emptyFilters, refresh: true })
      setFilters(emptyFilters)
    } catch (err) {
      setError(err.response?.data?.detail || 'Xoa tat ca san pham that bai.')
    } finally {
      setDeletingAll(false)
    }
  }

  const statusSummary = useMemo(() => {
    const available = products.filter((product) => product.status === 'available').length
    return { available, outOfStock: products.length - available }
  }, [products])

  const renderProduct = ({ item }) => {
    const isAvailable = item.status === 'available'

    return (
      <Surface mode="flat" style={styles.card}>
        <View style={styles.productHeader}>
          <View style={styles.productInfo}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.productName}>
              {item.name}
            </Text>
            <Text variant="bodySmall" numberOfLines={1} style={styles.productMeta}>
              {item.sku || 'Khong co SKU'}{item.category ? ` - ${item.category}` : ''}
            </Text>
          </View>
          <View style={[styles.statusBadge, isAvailable ? styles.statusAvailable : styles.statusOut]}>
            <Text style={[styles.statusText, isAvailable ? styles.statusAvailableText : styles.statusOutText]}>
              {isAvailable ? 'Con hang' : 'Het hang'}
            </Text>
          </View>
        </View>

        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text variant="labelSmall" style={styles.detailLabel}>Gia</Text>
            <Text variant="bodyMedium" style={styles.detailValue}>{formatPrice(item.price)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text variant="labelSmall" style={styles.detailLabel}>Ton kho</Text>
            <Text variant="bodyMedium" style={styles.detailValue}>
              {item.stock_quantity != null ? item.stock_quantity : '-'}
            </Text>
          </View>
        </View>

        {item.description ? (
          <Text variant="bodySmall" numberOfLines={2} style={styles.description}>
            {item.description}
          </Text>
        ) : null}

        <Text variant="bodySmall" style={styles.updatedAt}>
          Cap nhat {item.updated_at ? dayjs(item.updated_at).format('DD/MM/YYYY HH:mm') : '-'}
        </Text>

        <View style={styles.rowActions}>
          <Button mode="outlined" compact icon="pencil" onPress={() => openEditDialog(item)}>
            Sua
          </Button>
          <IconButton
            icon="delete"
            mode="outlined"
            iconColor={colors.danger}
            disabled={Boolean(deletingId)}
            onPress={() => setProductToDelete(item)}
            style={styles.deleteButton}
          />
        </View>
      </Surface>
    )
  }

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Quan ly san pham" subtitle={isBusiness ? `${products.length} san pham` : user?.email} />
        {isBusiness ? <Appbar.Action icon="plus" onPress={openCreateDialog} /> : null}
      </Appbar.Header>

      {!isBusiness ? (
        <View style={styles.center}>
          <Text variant="titleMedium" style={styles.permissionTitle}>Khong co quyen quan ly san pham</Text>
          <Text variant="bodySmall" style={styles.permissionText}>
            Man hinh nay chi danh cho tai khoan doanh nghiep.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.toolbar}>
            <Searchbar
              placeholder="Tim theo ten hoac SKU"
              value={filters.search}
              onChangeText={(value) => updateFilter('search', value)}
              style={styles.search}
              inputStyle={styles.searchInput}
            />
            <SegmentedButtons
              value={filters.status}
              onValueChange={(value) => updateFilter('status', value)}
              buttons={[
                { value: 'all', label: 'Tat ca' },
                { value: 'available', label: 'Con' },
                { value: 'out_of_stock', label: 'Het' },
              ]}
              density="small"
            />
            <View style={styles.filterRow}>
              <TextInput
                mode="outlined"
                dense
                label="Danh muc"
                value={filters.category}
                onChangeText={(value) => updateFilter('category', value)}
                style={styles.filterInput}
              />
              <TextInput
                mode="outlined"
                dense
                label="Gia tu"
                value={filters.minPrice}
                onChangeText={(value) => updateFilter('minPrice', value)}
                keyboardType="numeric"
                style={styles.filterInput}
              />
              <TextInput
                mode="outlined"
                dense
                label="Gia den"
                value={filters.maxPrice}
                onChangeText={(value) => updateFilter('maxPrice', value)}
                keyboardType="numeric"
                style={styles.filterInput}
              />
            </View>
            <View style={styles.summaryRow}>
              <Text variant="bodySmall" style={styles.summaryText}>
                {statusSummary.available} con hang / {statusSummary.outOfStock} het hang
              </Text>
              {hasActiveFilters ? <Button compact onPress={resetFilters}>Xoa loc</Button> : null}
            </View>
          </View>

          {error ? (
            <Surface mode="flat" style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
            </Surface>
          ) : null}

          <FlatList
            data={products}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderProduct}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchProducts({ refresh: true })} />
            }
            ListHeaderComponent={
              products.length > 0 ? (
                <View style={styles.listActions}>
                  <Button mode="contained" icon="plus" onPress={openCreateDialog}>
                    Them san pham
                  </Button>
                  <Button
                    mode="outlined"
                    icon="delete-sweep"
                    textColor={colors.danger}
                    onPress={() => setDeleteAllDialogOpen(true)}
                  >
                    Xoa tat ca
                  </Button>
                </View>
              ) : null
            }
            ListEmptyComponent={!loading ? (
              <Surface mode="flat" style={styles.empty}>
                <Text variant="titleMedium">
                  {hasActiveFilters ? 'Khong co san pham phu hop' : 'Chua co san pham nao'}
                </Text>
                <Text variant="bodySmall" style={styles.emptyText}>
                  Them san pham de AI co du lieu tu van cho khach hang.
                </Text>
                <Button mode="contained" icon="plus" onPress={openCreateDialog}>
                  Them san pham
                </Button>
              </Surface>
            ) : null}
            ListFooterComponent={loading ? <ActivityIndicator style={styles.loading} /> : null}
          />

          <Portal>
            <Dialog visible={productDialogOpen} onDismiss={closeProductDialog}>
              <Dialog.Title>{editingProduct ? 'Chinh sua san pham' : 'Them san pham'}</Dialog.Title>
              <Dialog.ScrollArea>
                <ScrollView contentContainerStyle={styles.dialogContent}>
                  <TextInput
                    mode="outlined"
                    label="Ten san pham"
                    value={form.name}
                    onChangeText={(value) => updateForm('name', value)}
                  />
                  <TextInput
                    mode="outlined"
                    label="SKU"
                    value={form.sku}
                    onChangeText={(value) => updateForm('sku', value)}
                    autoCapitalize="characters"
                  />
                  <TextInput
                    mode="outlined"
                    label="Danh muc"
                    value={form.category}
                    onChangeText={(value) => updateForm('category', value)}
                  />
                  <TextInput
                    mode="outlined"
                    label="Mo ta"
                    value={form.description}
                    onChangeText={(value) => updateForm('description', value)}
                    multiline
                    numberOfLines={3}
                  />
                  <View style={styles.formRow}>
                    <TextInput
                      mode="outlined"
                      label="Gia"
                      value={form.price}
                      onChangeText={(value) => updateForm('price', value)}
                      keyboardType="numeric"
                      style={styles.formHalf}
                    />
                    <TextInput
                      mode="outlined"
                      label="Ton kho"
                      value={form.stock_quantity}
                      onChangeText={(value) => updateForm('stock_quantity', value)}
                      keyboardType="numeric"
                      style={styles.formHalf}
                    />
                  </View>
                  <SegmentedButtons
                    value={form.status}
                    onValueChange={(value) => updateForm('status', value)}
                    buttons={[
                      { value: 'available', label: 'Con hang' },
                      { value: 'out_of_stock', label: 'Het hang' },
                    ]}
                  />
                </ScrollView>
              </Dialog.ScrollArea>
              <Dialog.Actions>
                <Button onPress={closeProductDialog}>Huy</Button>
                <Button loading={submitting} disabled={submitting} onPress={saveProduct}>
                  {editingProduct ? 'Cap nhat' : 'Them'}
                </Button>
              </Dialog.Actions>
            </Dialog>

            <Dialog visible={Boolean(productToDelete)} onDismiss={() => setProductToDelete(null)}>
              <Dialog.Title>Xoa san pham?</Dialog.Title>
              <Dialog.Content>
                <Text>Ban co chac muon xoa {productToDelete?.name}?</Text>
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setProductToDelete(null)}>Huy</Button>
                <Button
                  textColor={colors.danger}
                  loading={deletingId === productToDelete?.id}
                  disabled={Boolean(deletingId)}
                  onPress={deleteProduct}
                >
                  Xoa
                </Button>
              </Dialog.Actions>
            </Dialog>

            <Dialog visible={deleteAllDialogOpen} onDismiss={() => setDeleteAllDialogOpen(false)}>
              <Dialog.Title>Xoa tat ca san pham?</Dialog.Title>
              <Dialog.Content>
                <Text>
                  Toan bo san pham se bi xoa khoi he thong va AI tim kiem. Thao tac nay khong the hoan tac.
                </Text>
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setDeleteAllDialogOpen(false)}>Huy</Button>
                <Button textColor={colors.danger} loading={deletingAll} disabled={deletingAll} onPress={deleteAllProducts}>
                  Xoa tat ca
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </>
      )}
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  permissionText: {
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  toolbar: {
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  search: {
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.inputBg,
  },
  searchInput: {
    minHeight: 44,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryText: {
    color: colors.muted,
  },
  errorBox: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.errorBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.errorBorder,
  },
  errorText: {
    color: colors.danger,
  },
  list: {
    gap: 10,
    padding: 12,
    paddingBottom: 28,
  },
  listActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  card: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: colors.text,
    fontWeight: '700',
  },
  productMeta: {
    color: colors.muted,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusAvailable: {
    backgroundColor: colors.successBg,
  },
  statusOut: {
    backgroundColor: colors.dangerBg,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusAvailableText: {
    color: colors.success,
  },
  statusOutText: {
    color: colors.danger,
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  detailItem: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.softSurface,
  },
  detailLabel: {
    color: colors.muted,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontWeight: '700',
    marginTop: 2,
  },
  description: {
    color: colors.text,
    marginTop: 10,
    lineHeight: 18,
  },
  updatedAt: {
    color: colors.muted,
    marginTop: 10,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  deleteButton: {
    margin: 0,
    borderColor: colors.errorBorder,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    padding: 24,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
  },
  loading: {
    marginVertical: 16,
  },
  dialogContent: {
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formHalf: {
    flex: 1,
  },
})
