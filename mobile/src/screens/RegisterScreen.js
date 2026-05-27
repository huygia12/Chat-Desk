import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput } from 'react-native-paper'

import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

export default function RegisterScreen({ navigation }) {
  const register = useAuthStore((state) => state.register)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
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
      setError(err.response?.data?.detail || 'Dang ky that bai')
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
        <Text variant="headlineSmall" style={styles.title}>Tao tai khoan</Text>
        <TextInput label="Ten doanh nghiep" value={businessName} onChangeText={setBusinessName} mode="outlined" style={styles.input} />
        <TextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" mode="outlined" style={styles.input} />
        <TextInput label="So dien thoai" value={phone} onChangeText={setPhone} keyboardType="phone-pad" mode="outlined" style={styles.input} />
        <TextInput label="Mat khau" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={styles.input} />
        <HelperText type="error" visible={Boolean(error)}>{error}</HelperText>
        <Button mode="contained" loading={loading} disabled={loading} onPress={handleRegister}>
          Dang ky
        </Button>
        <Button mode="text" onPress={() => navigation.goBack()}>
          Quay lai dang nhap
        </Button>
      </View>
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors) => StyleSheet.create({
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
  title: {
    fontWeight: '700',
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
  },
})
