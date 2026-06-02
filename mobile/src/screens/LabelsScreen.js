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
  Surface,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper'
import dayjs from 'dayjs'

import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

const DEFAULT_COLOR = '#d6e400'
const colorOptions = ['#d6e400', '#1677ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2', '#fa541c']
const hexPattern = /^#[0-9a-fA-F]{6}$/

const emptyForm = {
  name: '',
  color: DEFAULT_COLOR,
  internal_note: '',
}

export default function LabelsScreen({ navigation }) {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [labels, setLabels] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState(null)
  const [labelToDelete, setLabelToDelete] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  const isBusiness = user?.role === 'business'

  const fetchLabels = useCallback(async ({ nextSearch = search, refresh = false } = {}) => {
    if (!isBusiness) return

    setError('')
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await client.get('/api/labels', {
        params: { search: nextSearch.trim() || undefined },
      })
      setLabels(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || t('labelsPage.loadError'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isBusiness, search, t])

  useEffect(() => {
    fetchLabels()
  }, [fetchLabels])

  useEffect(() => {
    if (!isBusiness) return undefined
    const timer = setTimeout(() => {
      fetchLabels({ nextSearch: search })
    }, 350)
    return () => clearTimeout(timer)
  }, [fetchLabels, isBusiness, search])

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const resetSearch = () => {
    setSearch('')
    fetchLabels({ nextSearch: '', refresh: true })
  }

  const openCreateDialog = () => {
    setEditingLabel(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (label) => {
    setEditingLabel(label)
    setForm({
      name: label.name || '',
      color: label.color || DEFAULT_COLOR,
      internal_note: label.internal_note || '',
    })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingLabel(null)
    setForm(emptyForm)
  }

  const validateForm = () => {
    if (!form.name.trim()) return t('labelsPage.nameRequired')
    if (form.name.trim().length > 80) return t('labelsPage.nameMax')
    if (!hexPattern.test(form.color.trim())) return t('labelsPage.colorInvalid')
    return ''
  }

  const saveLabel = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    const payload = {
      name: form.name.trim(),
      color: form.color.trim(),
      internal_note: form.internal_note.trim() || null,
    }

    setSubmitting(true)
    setError('')
    try {
      if (editingLabel) {
        await client.put(`/api/labels/${editingLabel.id}`, payload)
      } else {
        await client.post('/api/labels', payload)
      }
      closeDialog()
      await fetchLabels({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('labelsPage.actionError'))
    } finally {
      setSubmitting(false)
    }
  }

  const deleteLabel = async () => {
    if (!labelToDelete?.id) return

    setDeletingId(labelToDelete.id)
    setError('')
    try {
      await client.delete(`/api/labels/${labelToDelete.id}`)
      setLabelToDelete(null)
      await fetchLabels({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('labelsPage.deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  const renderLabel = ({ item }) => (
    <Surface mode="flat" style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.labelPreview}>
          <View style={[styles.colorDot, { backgroundColor: item.color || DEFAULT_COLOR }]} />
          <Text variant="titleMedium" numberOfLines={1} style={styles.labelName}>
            {item.name}
          </Text>
        </View>
        <View style={styles.iconActions}>
          <IconButton icon="pencil" mode="outlined" onPress={() => openEditDialog(item)} />
          <IconButton
            icon="delete"
            mode="outlined"
            iconColor={colors.danger}
            disabled={Boolean(deletingId)}
            onPress={() => setLabelToDelete(item)}
          />
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.hexText}>{item.color}</Text>
        <Text style={styles.updatedAt}>
          {t('common.updatedAt')} {item.updated_at ? dayjs(item.updated_at).format('DD/MM/YYYY HH:mm') : '-'}
        </Text>
      </View>
      {item.internal_note ? (
        <Text variant="bodySmall" style={styles.note}>{item.internal_note}</Text>
      ) : null}
    </Surface>
  )

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="ChatDesk" subtitle={t('labelsPage.title')} titleStyle={styles.brandTitle} />
        {isBusiness ? <Appbar.Action icon="plus" onPress={openCreateDialog} /> : null}
      </Appbar.Header>

      {!isBusiness ? (
        <View style={styles.center}>
          <Text variant="titleMedium" style={styles.permissionTitle}>{t('labelsPage.noPermissionTitle')}</Text>
          <Text variant="bodySmall" style={styles.permissionText}>{t('labelsPage.noPermissionText')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.toolbar}>
            <Searchbar
              placeholder={t('labelsPage.searchPlaceholder')}
              value={search}
              onChangeText={setSearch}
              style={styles.search}
              inputStyle={styles.searchInput}
            />
            <View style={styles.summaryRow}>
              <Text variant="bodySmall" style={styles.summaryText}>
                {t('labelsPage.summary', { count: labels.length })}
              </Text>
              {search.trim() ? <Button compact onPress={resetSearch}>{t('labelsPage.resetSearch')}</Button> : null}
            </View>
          </View>

          {error ? (
            <Surface mode="flat" style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
            </Surface>
          ) : null}

          <FlatList
            data={labels}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderLabel}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLabels({ refresh: true })} />}
            ListEmptyComponent={!loading ? (
              <View style={styles.empty}>
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  {search.trim() ? t('labelsPage.noFilteredLabels') : t('labelsPage.empty')}
                </Text>
                <Text variant="bodySmall" style={styles.emptyText}>{t('labelsPage.helper')}</Text>
              </View>
            ) : null}
            ListFooterComponent={loading ? <ActivityIndicator style={styles.loading} /> : null}
          />
        </>
      )}

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={closeDialog}>
          <Dialog.Title>
            {editingLabel ? t('labelsPage.editTitle') : t('labelsPage.addTitle')}
          </Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <TextInput
                mode="outlined"
                label={t('labelsPage.name')}
                value={form.name}
                onChangeText={(value) => updateForm('name', value)}
              />

              <View style={styles.previewBlock}>
                <Text variant="bodySmall" style={styles.helper}>{t('labelsPage.preview')}</Text>
                <View style={styles.labelPreviewLarge}>
                  <View style={[styles.colorDot, { backgroundColor: hexPattern.test(form.color) ? form.color : DEFAULT_COLOR }]} />
                  <Text style={styles.labelName}>{form.name.trim() || 'Label'}</Text>
                </View>
              </View>

              <View style={styles.swatchRow}>
                {colorOptions.map((color) => (
                  <TouchableRipple
                    key={color}
                    borderless
                    onPress={() => updateForm('color', color)}
                    style={[
                      styles.swatch,
                      { backgroundColor: color },
                      form.color.toLowerCase() === color.toLowerCase() ? styles.swatchSelected : null,
                    ]}
                  >
                    <View />
                  </TouchableRipple>
                ))}
              </View>

              <TextInput
                mode="outlined"
                label={t('labelsPage.colorLabel')}
                value={form.color}
                onChangeText={(value) => updateForm('color', value)}
                autoCapitalize="none"
              />
              <TextInput
                mode="outlined"
                label={t('labelsPage.note')}
                value={form.internal_note}
                onChangeText={(value) => updateForm('internal_note', value)}
                multiline
                numberOfLines={4}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={closeDialog} disabled={submitting}>{t('common.cancel')}</Button>
            <Button mode="contained" loading={submitting} disabled={submitting} onPress={saveLabel}>
              {editingLabel ? t('common.update') : t('labelsPage.createButton')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={Boolean(labelToDelete)} onDismiss={() => setLabelToDelete(null)}>
          <Dialog.Title>{t('labelsPage.deleteTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('labelsPage.deleteDescription')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLabelToDelete(null)} disabled={Boolean(deletingId)}>
              {t('common.cancel')}
            </Button>
            <Button loading={Boolean(deletingId)} disabled={Boolean(deletingId)} textColor={colors.danger} onPress={deleteLabel}>
              {t('common.delete')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  brandTitle: {
    color: colors.primary,
    fontWeight: '800',
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
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  search: {
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  searchInput: {
    fontSize: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  summaryText: {
    color: colors.muted,
  },
  errorBox: {
    marginHorizontal: 16,
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
    gap: 12,
    padding: 16,
    paddingBottom: 28,
  },
  card: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  labelPreview: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  labelPreviewLarge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.softSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  labelName: {
    flexShrink: 1,
    color: colors.text,
    fontWeight: '800',
  },
  iconActions: {
    flexDirection: 'row',
    marginTop: -8,
    marginRight: -8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  hexText: {
    color: colors.text,
    fontWeight: '800',
  },
  updatedAt: {
    color: colors.muted,
  },
  note: {
    color: colors.muted,
    lineHeight: 18,
    marginTop: 8,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: colors.text,
    textAlign: 'center',
    fontWeight: '700',
  },
  emptyText: {
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  loading: {
    paddingVertical: 18,
  },
  dialogContent: {
    gap: 12,
    paddingVertical: 12,
  },
  previewBlock: {
    gap: 8,
  },
  helper: {
    color: colors.muted,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: colors.text,
  },
})
