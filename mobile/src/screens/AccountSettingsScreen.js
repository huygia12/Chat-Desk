import { useEffect, useMemo, useState } from 'react'
import { Image, ScrollView, StyleSheet, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Appbar, Avatar, Button, HelperText, Surface, Text, TextInput } from 'react-native-paper'

import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emptyBusinessForm = {
  business_name: '',
  business_description: '',
  phone: '',
  hotline: '',
  store_address: '',
  opening_hours: '',
  shipping_policy: '',
  warranty_policy: '',
  payment_methods: '',
}

const emptyEmployeeForm = {
  full_name: '',
  email: '',
}

const emptyPasswordForm = {
  current_password: '',
  password: '',
  confirm_password: '',
}

export default function AccountSettingsScreen({ navigation }) {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const fetchUser = useAuthStore((state) => state.fetchUser)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [businessForm, setBusinessForm] = useState(emptyBusinessForm)
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm)
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isBusiness = user?.role === 'business'
  const avatarLabel = String(user?.business_name || user?.full_name || user?.email || 'C')
    .trim()
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    if (!user) return
    setBusinessForm({
      business_name: user.business_name || '',
      business_description: user.business_description || '',
      phone: user.phone || '',
      hotline: user.hotline || '',
      store_address: user.store_address || '',
      opening_hours: user.opening_hours || '',
      shipping_policy: user.shipping_policy || '',
      warranty_policy: user.warranty_policy || '',
      payment_methods: user.payment_methods || '',
    })
    setEmployeeForm({
      full_name: user.full_name || '',
      email: user.email || '',
    })
  }, [user])

  const updateBusinessForm = (field, value) => {
    setBusinessForm((current) => ({ ...current, [field]: value }))
  }

  const updateEmployeeForm = (field, value) => {
    setEmployeeForm((current) => ({ ...current, [field]: value }))
  }

  const updatePasswordForm = (field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }))
  }

  const resetNotice = () => {
    setError('')
    setSuccess('')
  }

  const saveBusinessProfile = async () => {
    if (!businessForm.business_name.trim()) {
      setError(t('settings.nameRequired'))
      setSuccess('')
      return
    }

    setSavingProfile(true)
    resetNotice()
    try {
      await client.put('/api/users/profile', {
        ...businessForm,
        business_name: businessForm.business_name.trim(),
      })
      await fetchUser()
      setSuccess(t('settings.updateSuccess'))
    } catch (err) {
      setError(err.response?.data?.detail || t('settings.updateError'))
    } finally {
      setSavingProfile(false)
    }
  }

  const uploadAvatar = async () => {
    resetNotice()
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError(t('settings.avatarPermissionError'))
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    })

    if (result.canceled || !result.assets?.[0]) return

    const asset = result.assets[0]
    const fileName = asset.fileName || `avatar-${Date.now()}.jpg`
    const mimeType = asset.mimeType || 'image/jpeg'
    const formData = new FormData()
    formData.append('file', {
      uri: asset.uri,
      name: fileName,
      type: mimeType,
    })

    setUploadingAvatar(true)
    try {
      await client.post('/api/users/profile/avatar', formData)
      await fetchUser()
      setSuccess(t('settings.avatarUploadSuccess'))
    } catch (err) {
      setError(err.response?.data?.detail || t('settings.avatarUploadError'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const saveEmployeeProfile = async () => {
    const fullName = employeeForm.full_name.trim()
    const email = employeeForm.email.trim()
    if (!fullName) {
      setError(t('employees.fullNameRequired'))
      setSuccess('')
      return
    }
    if (!email) {
      setError(t('employees.emailRequired'))
      setSuccess('')
      return
    }
    if (!EMAIL_PATTERN.test(email)) {
      setError(t('employees.invalidEmail'))
      setSuccess('')
      return
    }

    setSavingProfile(true)
    resetNotice()
    try {
      await client.patch('/api/employees/me/profile', {
        full_name: fullName,
        email,
      })
      await fetchUser()
      setSuccess(t('employees.profileSuccess'))
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.profileError'))
    } finally {
      setSavingProfile(false)
    }
  }

  const saveEmployeePassword = async () => {
    if (!passwordForm.current_password) {
      setError(t('employees.currentPasswordRequired'))
      setSuccess('')
      return
    }
    if (!passwordForm.password) {
      setError(t('employees.newPasswordRequired'))
      setSuccess('')
      return
    }
    if (passwordForm.password.length < 6) {
      setError(t('employees.passwordMin'))
      setSuccess('')
      return
    }
    if (passwordForm.password !== passwordForm.confirm_password) {
      setError(t('employees.passwordMismatch'))
      setSuccess('')
      return
    }

    setSavingPassword(true)
    resetNotice()
    try {
      await client.patch('/api/employees/me/password', {
        current_password: passwordForm.current_password,
        password: passwordForm.password,
      })
      setPasswordForm(emptyPasswordForm)
      setSuccess(t('employees.ownPasswordSuccess'))
    } catch (err) {
      setError(err.response?.data?.detail || t('employees.passwordError'))
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content
          title="ChatDesk"
          subtitle={isBusiness ? t('settings.title') : t('employees.settingsTitle')}
          titleStyle={styles.brandTitle}
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {success ? <HelperText type="info" visible>{success}</HelperText> : null}

        {isBusiness ? (
          <>
            <Surface mode="flat" style={styles.panel}>
              <View style={styles.avatarRow}>
                <View style={styles.avatarFrame}>
                  {user?.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <Avatar.Text size={76} label={avatarLabel} style={styles.avatarFallback} color={colors.primary} />
                  )}
                </View>
                <View style={styles.avatarText}>
                  <Text variant="titleSmall" style={styles.sectionTitle}>{t('settings.avatar')}</Text>
                  <Text variant="bodySmall" style={styles.helper}>{t('settings.avatarHint')}</Text>
                  <Button
                    mode="outlined"
                    icon="image-edit"
                    loading={uploadingAvatar}
                    disabled={uploadingAvatar}
                    onPress={uploadAvatar}
                    style={styles.inlineButton}
                  >
                    {t('settings.uploadAvatar')}
                  </Button>
                </View>
              </View>
            </Surface>

            <Surface mode="flat" style={styles.panel}>
              <Text variant="titleMedium" style={styles.panelTitle}>{t('settings.title')}</Text>
              <Text variant="bodySmall" style={styles.helper}>{t('settings.helper')}</Text>
              <TextInput
                mode="outlined"
                label="Email"
                value={user?.email || ''}
                disabled
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.businessName')}
                value={businessForm.business_name}
                onChangeText={(value) => updateBusinessForm('business_name', value)}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.description')}
                value={businessForm.business_description}
                onChangeText={(value) => updateBusinessForm('business_description', value)}
                multiline
                numberOfLines={4}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.phone')}
                value={businessForm.phone}
                onChangeText={(value) => updateBusinessForm('phone', value)}
                keyboardType="phone-pad"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.hotline')}
                value={businessForm.hotline}
                onChangeText={(value) => updateBusinessForm('hotline', value)}
                keyboardType="phone-pad"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.storeAddress')}
                value={businessForm.store_address}
                onChangeText={(value) => updateBusinessForm('store_address', value)}
                multiline
                numberOfLines={2}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.openingHours')}
                value={businessForm.opening_hours}
                onChangeText={(value) => updateBusinessForm('opening_hours', value)}
                multiline
                numberOfLines={2}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.shippingPolicy')}
                value={businessForm.shipping_policy}
                onChangeText={(value) => updateBusinessForm('shipping_policy', value)}
                multiline
                numberOfLines={3}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.warrantyPolicy')}
                value={businessForm.warranty_policy}
                onChangeText={(value) => updateBusinessForm('warranty_policy', value)}
                multiline
                numberOfLines={3}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('settings.paymentMethods')}
                value={businessForm.payment_methods}
                onChangeText={(value) => updateBusinessForm('payment_methods', value)}
                multiline
                numberOfLines={2}
                style={styles.input}
              />
              <Button mode="contained" loading={savingProfile} disabled={savingProfile} onPress={saveBusinessProfile}>
                {t('settings.save')}
              </Button>
            </Surface>
          </>
        ) : (
          <>
            <Surface mode="flat" style={styles.panel}>
              <Text variant="titleMedium" style={styles.panelTitle}>{t('employees.basicInfo')}</Text>
              <TextInput
                mode="outlined"
                label={t('employees.fullName')}
                value={employeeForm.full_name}
                onChangeText={(value) => updateEmployeeForm('full_name', value)}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('employees.loginEmail')}
                value={employeeForm.email}
                onChangeText={(value) => updateEmployeeForm('email', value)}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <Button mode="contained" loading={savingProfile} disabled={savingProfile} onPress={saveEmployeeProfile}>
                {t('employees.saveInfo')}
              </Button>
            </Surface>

            <Surface mode="flat" style={styles.panel}>
              <Text variant="titleMedium" style={styles.panelTitle}>{t('employees.changePassword')}</Text>
              <TextInput
                mode="outlined"
                label={t('employees.currentPassword')}
                value={passwordForm.current_password}
                onChangeText={(value) => updatePasswordForm('current_password', value)}
                secureTextEntry
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('employees.newPassword')}
                value={passwordForm.password}
                onChangeText={(value) => updatePasswordForm('password', value)}
                secureTextEntry
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label={t('employees.confirmPassword')}
                value={passwordForm.confirm_password}
                onChangeText={(value) => updatePasswordForm('confirm_password', value)}
                secureTextEntry
                style={styles.input}
              />
              <Button mode="contained-tonal" loading={savingPassword} disabled={savingPassword} onPress={saveEmployeePassword}>
                {t('employees.changePassword')}
              </Button>
            </Surface>
          </>
        )}
      </ScrollView>
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
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 28,
  },
  panel: {
    gap: 12,
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  panelTitle: {
    color: colors.text,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '800',
  },
  helper: {
    color: colors.muted,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.surface,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarFrame: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 3,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    backgroundColor: colors.primarySoft,
  },
  avatarText: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
  },
})
