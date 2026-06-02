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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emptyCreateForm = {
  full_name: '',
  email: '',
  password: '',
}

const emptyEditForm = {
  full_name: '',
  email: '',
  password: '',
  confirm_password: '',
}

export default function EmployeesScreen({ navigation }) {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [employees, setEmployees] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [employeeToDelete, setEmployeeToDelete] = useState(null)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [submitting, setSubmitting] = useState(false)
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  const isBusiness = user?.role === 'business'

  const fetchEmployees = useCallback(async ({ query = search, refresh = false } = {}) => {
    if (!isBusiness) return

    setError('')
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await client.get('/api/employees', {
        params: { search: query.trim() || undefined },
      })
      setEmployees(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.loadFailed'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isBusiness, search, t])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  useEffect(() => {
    if (!isBusiness) return undefined
    const timer = setTimeout(() => {
      fetchEmployees({ query: search })
    }, 350)
    return () => clearTimeout(timer)
  }, [fetchEmployees, isBusiness, search])

  const updateCreateForm = (field, value) => {
    setCreateForm((current) => ({ ...current, [field]: value }))
  }

  const updateEditForm = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  const resetSearch = () => {
    setSearch('')
    fetchEmployees({ query: '', refresh: true })
  }

  const validateProfile = (values) => {
    const fullName = values.full_name.trim()
    const email = values.email.trim()

    if (!fullName) return t('employees.fullNameRequired')
    if (!email) return t('employees.emailRequired')
    if (!EMAIL_PATTERN.test(email)) return t('employees.invalidEmail')
    return ''
  }

  const validatePassword = (password, confirmPassword = password) => {
    if (!password) return t('employees.passwordRequired')
    if (password.length < 6) return t('employees.passwordMin')
    if (password !== confirmPassword) return t('employees.passwordMismatch')
    return ''
  }

  const createEmployee = async () => {
    const profileError = validateProfile(createForm)
    const passwordError = validatePassword(createForm.password)
    const validationError = profileError || passwordError
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await client.post('/api/employees', {
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
      })
      setCreateDialogOpen(false)
      setCreateForm(emptyCreateForm)
      await fetchEmployees({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const openEditDialog = (employee) => {
    setEditingEmployee(employee)
    setEditForm({
      full_name: employee.full_name || '',
      email: employee.email || '',
      password: '',
      confirm_password: '',
    })
    setEditDialogOpen(true)
  }

  const closeEditDialog = () => {
    setEditDialogOpen(false)
    setEditingEmployee(null)
    setEditForm(emptyEditForm)
  }

  const updateProfile = async () => {
    if (!editingEmployee) return
    const validationError = validateProfile(editForm)
    if (validationError) {
      setError(validationError)
      return
    }

    setProfileSubmitting(true)
    setError('')
    try {
      await client.patch(`/api/employees/${editingEmployee.id}/profile`, {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
      })
      await fetchEmployees({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.updateProfileFailed'))
    } finally {
      setProfileSubmitting(false)
    }
  }

  const updatePassword = async () => {
    if (!editingEmployee) return
    const validationError = validatePassword(editForm.password, editForm.confirm_password)
    if (validationError) {
      setError(validationError)
      return
    }

    setPasswordSubmitting(true)
    setError('')
    try {
      await client.patch(`/api/employees/${editingEmployee.id}/password`, {
        password: editForm.password,
      })
      setEditForm((current) => ({ ...current, password: '', confirm_password: '' }))
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.updatePasswordFailed'))
    } finally {
      setPasswordSubmitting(false)
    }
  }

  const toggleStatus = async (employee) => {
    setStatusUpdatingId(employee.id)
    setError('')
    try {
      await client.patch(`/api/employees/${employee.id}`, {
        is_active: !employee.is_active,
      })
      await fetchEmployees({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.updateStatusFailed'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const deleteEmployee = async () => {
    if (!employeeToDelete?.id) return

    setDeletingId(employeeToDelete.id)
    setError('')
    try {
      await client.delete(`/api/employees/${employeeToDelete.id}`)
      setEmployeeToDelete(null)
      await fetchEmployees({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.deleteFailed'))
    } finally {
      setDeletingId(null)
    }
  }

  const activeCount = useMemo(
    () => employees.filter((employee) => employee.is_active).length,
    [employees],
  )

  const renderEmployee = ({ item }) => {
    const initials = (item.full_name || item.email || '?')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()

    return (
      <Surface mode="flat" style={styles.card}>
        <View style={styles.employeeHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <View style={styles.employeeInfo}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.employeeName}>
              {item.full_name || '-'}
            </Text>
            <Text variant="bodySmall" numberOfLines={1} style={styles.employeeEmail}>
              {item.email}
            </Text>
          </View>
          <View style={[styles.statusBadge, item.is_active ? styles.statusActive : styles.statusLocked]}>
            <Text style={[styles.statusText, item.is_active ? styles.statusActiveText : styles.statusLockedText]}>
              {item.is_active ? t('common.active') : t('employees.locked')}
            </Text>
          </View>
        </View>

        <Text variant="bodySmall" style={styles.createdAt}>
          {t('employees.createdAt', { date: item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '-' })}
        </Text>

        <View style={styles.rowActions}>
          <Button mode="outlined" compact icon="pencil" onPress={() => openEditDialog(item)}>
            {t('common.edit')}
          </Button>
          <Button
            mode="outlined"
            compact
            icon={item.is_active ? 'lock' : 'lock-open-variant'}
            loading={statusUpdatingId === item.id}
            disabled={Boolean(statusUpdatingId)}
            onPress={() => toggleStatus(item)}
          >
            {item.is_active ? t('employees.lock') : t('employees.unlock')}
          </Button>
          <IconButton
            icon="delete"
            mode="outlined"
            iconColor={colors.danger}
            disabled={Boolean(deletingId)}
            onPress={() => setEmployeeToDelete(item)}
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
        <Appbar.Content title={t('employees.title')} subtitle={isBusiness ? t('employees.subtitle', { count: employees.length }) : user?.email} />
        {isBusiness ? <Appbar.Action icon="account-plus" onPress={() => setCreateDialogOpen(true)} /> : null}
      </Appbar.Header>

      {!isBusiness ? (
        <View style={styles.center}>
          <Text variant="titleMedium" style={styles.permissionTitle}>{t('employees.noPermissionTitle')}</Text>
          <Text variant="bodySmall" style={styles.permissionText}>
            {t('employees.noPermissionText')}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.toolbar}>
            <Searchbar
              placeholder={t('employees.searchPlaceholder')}
              value={search}
              onChangeText={setSearch}
              style={styles.search}
              inputStyle={styles.searchInput}
            />
            <View style={styles.summaryRow}>
              <Text variant="bodySmall" style={styles.summaryText}>
                {t('employees.activeSummary', { active: activeCount, total: employees.length })}
              </Text>
              {search.trim() ? <Button compact onPress={resetSearch}>{t('employees.clearSearch')}</Button> : null}
            </View>
          </View>

          {error ? (
            <Surface mode="flat" style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
            </Surface>
          ) : null}

          <FlatList
            data={employees}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderEmployee}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchEmployees({ refresh: true })} />
            }
            ListEmptyComponent={!loading ? (
              <Surface mode="flat" style={styles.empty}>
                <Text variant="titleMedium">
                  {search.trim() ? t('employees.emptyFiltered') : t('employees.emptyTitle')}
                </Text>
                <Text variant="bodySmall" style={styles.emptyText}>
                  {t('employees.emptySubtitle')}
                </Text>
                <Button mode="contained" icon="account-plus" onPress={() => setCreateDialogOpen(true)}>
                  {t('employees.addEmployee')}
                </Button>
              </Surface>
            ) : null}
            ListFooterComponent={loading ? <ActivityIndicator style={styles.loading} /> : null}
          />

          <Portal>
            <Dialog
              visible={createDialogOpen}
              onDismiss={() => {
                setCreateDialogOpen(false)
                setCreateForm(emptyCreateForm)
              }}
            >
              <Dialog.Title>{t('employees.createTitle')}</Dialog.Title>
              <Dialog.ScrollArea>
                <ScrollView contentContainerStyle={styles.dialogContent}>
                  <TextInput
                    mode="outlined"
                    label={t('employees.fullName')}
                    value={createForm.full_name}
                    onChangeText={(value) => updateCreateForm('full_name', value)}
                  />
                  <TextInput
                    mode="outlined"
                    label={t('employees.loginEmail')}
                    value={createForm.email}
                    onChangeText={(value) => updateCreateForm('email', value)}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <TextInput
                    mode="outlined"
                    label={t('employees.temporaryPassword')}
                    value={createForm.password}
                    onChangeText={(value) => updateCreateForm('password', value)}
                    secureTextEntry
                  />
                </ScrollView>
              </Dialog.ScrollArea>
              <Dialog.Actions>
                <Button onPress={() => setCreateDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button loading={submitting} disabled={submitting} onPress={createEmployee}>
                  {t('employees.createAccount')}
                </Button>
              </Dialog.Actions>
            </Dialog>

            <Dialog visible={editDialogOpen} onDismiss={closeEditDialog}>
              <Dialog.Title>{t('employees.editTitle')}</Dialog.Title>
              <Dialog.ScrollArea>
                <ScrollView contentContainerStyle={styles.dialogContent}>
                  <Text variant="titleSmall" style={styles.dialogSectionTitle}>{t('employees.basicInfo')}</Text>
                  <TextInput
                    mode="outlined"
                    label={t('employees.fullName')}
                    value={editForm.full_name}
                    onChangeText={(value) => updateEditForm('full_name', value)}
                  />
                  <TextInput
                    mode="outlined"
                    label={t('employees.loginEmail')}
                    value={editForm.email}
                    onChangeText={(value) => updateEditForm('email', value)}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Button
                    mode="contained"
                    loading={profileSubmitting}
                    disabled={profileSubmitting}
                    onPress={updateProfile}
                    style={styles.dialogButton}
                  >
                    {t('employees.saveInfo')}
                  </Button>

                  <View style={styles.divider} />

                  <Text variant="titleSmall" style={styles.dialogSectionTitle}>{t('employees.changePassword')}</Text>
                  <TextInput
                    mode="outlined"
                    label={t('employees.newPassword')}
                    value={editForm.password}
                    onChangeText={(value) => updateEditForm('password', value)}
                    secureTextEntry
                  />
                  <TextInput
                    mode="outlined"
                    label={t('employees.confirmNewPassword')}
                    value={editForm.confirm_password}
                    onChangeText={(value) => updateEditForm('confirm_password', value)}
                    secureTextEntry
                  />
                  <Button
                    mode="contained-tonal"
                    loading={passwordSubmitting}
                    disabled={passwordSubmitting}
                    onPress={updatePassword}
                    style={styles.dialogButton}
                  >
                    {t('employees.changePassword')}
                  </Button>
                </ScrollView>
              </Dialog.ScrollArea>
              <Dialog.Actions>
                <Button onPress={closeEditDialog}>{t('common.close')}</Button>
              </Dialog.Actions>
            </Dialog>

            <Dialog visible={Boolean(employeeToDelete)} onDismiss={() => setEmployeeToDelete(null)}>
              <Dialog.Title>{t('employees.deleteTitle')}</Dialog.Title>
              <Dialog.Content>
                <Text>
                  {t('employees.deleteBody', { name: employeeToDelete?.full_name || employeeToDelete?.email })}
                </Text>
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setEmployeeToDelete(null)}>{t('common.cancel')}</Button>
                <Button
                  textColor={colors.danger}
                  loading={deletingId === employeeToDelete?.id}
                  disabled={Boolean(deletingId)}
                  onPress={deleteEmployee}
                >
                  {t('common.delete')}
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
    gap: 8,
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
  card: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
  },
  employeeInfo: {
    flex: 1,
    minWidth: 0,
  },
  employeeName: {
    color: colors.text,
    fontWeight: '700',
  },
  employeeEmail: {
    color: colors.muted,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusActive: {
    backgroundColor: colors.successBg,
  },
  statusLocked: {
    backgroundColor: colors.dangerBg,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusActiveText: {
    color: colors.success,
  },
  statusLockedText: {
    color: colors.danger,
  },
  createdAt: {
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
  },
  loading: {
    marginVertical: 16,
  },
  dialogContent: {
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  dialogSectionTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  dialogButton: {
    borderRadius: 8,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
})
