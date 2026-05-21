import { MD3LightTheme } from 'react-native-paper'

export const colors = {
  primary: '#1677ff',
  primarySoft: '#e6f4ff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f5f7fb',
  surface: '#ffffff',
  success: '#16a34a',
  danger: '#dc2626',
}

export const theme = {
  ...MD3LightTheme,
  roundness: 8,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    secondary: colors.primary,
    background: colors.bg,
    surface: colors.surface,
    outline: colors.border,
  },
}
