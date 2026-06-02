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
} from 'react-native-paper'

import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

const emptyForm = {
  title: '',
  shortcut: '',
  content: '',
}

const shortcutPattern = /^[a-zA-Z0-9_-]+$/

export default function SavedRepliesScreen({ navigation }) {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [replies, setReplies] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingReply, setEditingReply] = useState(null)
  const [replyToDelete, setReplyToDelete] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  const isBusiness = user?.role === 'business'

  const fetchReplies = useCallback(async ({ nextSearch = search, refresh = false } = {}) => {
    setError('')
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await client.get('/api/saved-replies', {
        params: { search: nextSearch.trim() || undefined },
      })
      setReplies(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || t('savedReplies.loadError'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [search, t])

  useEffect(() => {
    fetchReplies()
  }, [fetchReplies])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReplies({ nextSearch: search })
    }, 350)
    return () => clearTimeout(timer)
  }, [fetchReplies, search])

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const resetSearch = () => {
    setSearch('')
    fetchReplies({ nextSearch: '', refresh: true })
  }

  const openCreateDialog = () => {
    setEditingReply(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (reply) => {
    setEditingReply(reply)
    setForm({
      title: reply.title || '',
      shortcut: reply.shortcut || '',
      content: reply.content || '',
    })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingReply(null)
    setForm(emptyForm)
  }

  const validateForm = () => {
    const shortcut = form.shortcut.trim().replace(/^\//, '')
    if (!form.title.trim()) return t('savedReplies.titleRequired')
    if (!shortcut) return t('savedReplies.shortcutRequired')
    if (!shortcutPattern.test(shortcut)) return t('savedReplies.shortcutInvalid')
    if (!form.content.trim()) return t('savedReplies.contentRequired')
    return ''
  }

  const saveReply = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    const payload = {
      title: form.title.trim(),
      shortcut: form.shortcut.trim().replace(/^\//, ''),
      content: form.content.trim(),
    }

    setSubmitting(true)
    setError('')
    try {
      if (editingReply) {
        await client.put(`/api/saved-replies/${editingReply.id}`, payload)
      } else {
        await client.post('/api/saved-replies', {
          ...payload,
          visibility: isBusiness ? 'business' : 'personal',
        })
      }
      closeDialog()
      await fetchReplies({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('savedReplies.actionError'))
    } finally {
      setSubmitting(false)
    }
  }

  const deleteReply = async () => {
    if (!replyToDelete?.id) return

    setDeletingId(replyToDelete.id)
    setError('')
    try {
      await client.delete(`/api/saved-replies/${replyToDelete.id}`)
      setReplyToDelete(null)
      await fetchReplies({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('savedReplies.deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  const canModify = (reply) => {
    if (isBusiness) return reply.visibility === 'business'
    return reply.visibility === 'personal' && reply.owner_id === user?.id
  }

  const renderReply = ({ item }) => {
    const editable = canModify(item)
    return (
      <Surface mode="flat" style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardText}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.cardTitle}>
              {item.title}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.shortcut}>/{item.shortcut}</Text>
              <Text style={styles.scope}>
                {item.visibility === 'business' ? t('savedReplies.business') : t('savedReplies.personal')}
              </Text>
            </View>
          </View>
          {editable ? (
            <View style={styles.iconActions}>
              <IconButton icon="pencil" mode="outlined" onPress={() => openEditDialog(item)} />
              <IconButton
                icon="delete"
                mode="outlined"
                iconColor={colors.danger}
                disabled={Boolean(deletingId)}
                onPress={() => setReplyToDelete(item)}
              />
            </View>
          ) : null}
        </View>
        <Text variant="bodyMedium" style={styles.contentText}>
          {item.content}
        </Text>
      </Surface>
    )
  }

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="ChatDesk" subtitle={t('savedReplies.pageTitle')} titleStyle={styles.brandTitle} />
        <Appbar.Action icon="plus" onPress={openCreateDialog} />
      </Appbar.Header>

      <View style={styles.toolbar}>
        <Searchbar
          placeholder={t('savedReplies.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          style={styles.search}
          inputStyle={styles.searchInput}
        />
        {search.trim() ? <Button compact onPress={resetSearch}>{t('savedReplies.resetSearch')}</Button> : null}
      </View>

      {error ? (
        <Surface mode="flat" style={styles.errorBox}>
          <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
        </Surface>
      ) : null}

      <FlatList
        data={replies}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderReply}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReplies({ refresh: true })} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Text variant="titleMedium" style={styles.emptyTitle}>
              {search.trim() ? t('savedReplies.noFilteredReplies') : t('savedReplies.empty')}
            </Text>
          </View>
        ) : null}
        ListFooterComponent={loading ? <ActivityIndicator style={styles.loading} /> : null}
      />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={closeDialog}>
          <Dialog.Title>
            {editingReply ? t('savedReplies.editTitle') : t('savedReplies.addTitle')}
          </Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <TextInput
                mode="outlined"
                label={t('savedReplies.title')}
                value={form.title}
                onChangeText={(value) => updateForm('title', value)}
              />
              <TextInput
                mode="outlined"
                label="Shortcut"
                value={form.shortcut}
                onChangeText={(value) => updateForm('shortcut', value)}
                left={<TextInput.Affix text="/" />}
                autoCapitalize="none"
              />
              <TextInput
                mode="outlined"
                label={t('savedReplies.content')}
                value={form.content}
                onChangeText={(value) => updateForm('content', value)}
                multiline
                numberOfLines={5}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={closeDialog} disabled={submitting}>{t('common.cancel')}</Button>
            <Button mode="contained" loading={submitting} disabled={submitting} onPress={saveReply}>
              {editingReply ? t('common.update') : t('common.create')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={Boolean(replyToDelete)} onDismiss={() => setReplyToDelete(null)}>
          <Dialog.Title>{t('savedReplies.deleteTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{replyToDelete?.title}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setReplyToDelete(null)} disabled={Boolean(deletingId)}>
              {t('common.cancel')}
            </Button>
            <Button loading={Boolean(deletingId)} disabled={Boolean(deletingId)} textColor={colors.danger} onPress={deleteReply}>
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
    gap: 8,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  shortcut: {
    color: colors.primary,
    fontWeight: '800',
  },
  scope: {
    color: colors.muted,
    fontWeight: '700',
  },
  iconActions: {
    flexDirection: 'row',
    marginTop: -8,
    marginRight: -8,
  },
  contentText: {
    color: colors.text,
    lineHeight: 20,
    marginTop: 10,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: colors.muted,
    textAlign: 'center',
  },
  loading: {
    paddingVertical: 18,
  },
  dialogContent: {
    gap: 12,
    paddingVertical: 12,
  },
})
