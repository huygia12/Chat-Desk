import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput } from 'react-native-paper'

import LanguageToggle from '../components/LanguageToggle'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { colors } from '../theme/theme'

export default function RegisterScreen({ navigation }) {
  const { t } = useI18n()
  const register = useAuthStore((state) => state.register)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    try {
      await register(email.trim(), password, businessName.trim(), phone.trim() || null)
    } catch (err) {
      setError(err.response?.data?.detail || t('auth.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text variant="headlineSmall" style={styles.title}>{t('auth.registerTitle')}</Text>
          <LanguageToggle compact />
        </View>
        <TextInput label={t('auth.businessName')} value={businessName} onChangeText={setBusinessName} mode="outlined" style={styles.input} />
        <TextInput label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" mode="outlined" style={styles.input} />
        <TextInput label={t('auth.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" mode="outlined" style={styles.input} />
        <TextInput label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={styles.input} />
        <HelperText type="error" visible={Boolean(error)}>{error}</HelperText>
        <Button mode="contained" loading={loading} disabled={loading} onPress={handleRegister}>
          {t('auth.registerButton')}
        </Button>
        <Button mode="text" onPress={() => navigation.goBack()}>
          {t('auth.backToLogin')}
        </Button>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.bg,
  },
  card: {
    gap: 10,
    padding: 18,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontWeight: '700',
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
  },
})
