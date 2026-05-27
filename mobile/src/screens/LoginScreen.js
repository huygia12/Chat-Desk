import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput } from 'react-native-paper'

import { useAuthStore } from '../store/authStore'
import { colors } from '../theme/theme'

export default function LoginScreen({ navigation }) {
  const login = useAuthStore((state) => state.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Dang nhap that bai')
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
        <Text variant="headlineMedium" style={styles.title}>ChatDesk</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>Dang nhap danh cho doanh nghiep va nhan vien CSKH</Text>

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="Mat khau"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          mode="outlined"
          style={styles.input}
        />
        <HelperText type="error" visible={Boolean(error)}>{error}</HelperText>
        <Button mode="contained" loading={loading} disabled={loading} onPress={handleLogin}>
          Dang nhap
        </Button>
        <Button mode="text" onPress={() => navigation.navigate('Register')}>
          Tao tai khoan doanh nghiep
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
  title: {
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    marginBottom: 8,
    color: colors.muted,
  },
  input: {
    backgroundColor: colors.surface,
  },
})
