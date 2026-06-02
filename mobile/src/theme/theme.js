import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native'
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper'

export const lightColors = {
  primary: '#1677ff',
  primarySoft: '#e6f4ff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f5f7fb',
  surface: '#ffffff',
  success: '#16a34a',
  danger: '#dc2626',
  inputBg: '#f8fafc',
  softSurface: '#f8fafc',
  errorBg: '#fef2f2',
  errorBorder: '#fecaca',
  successBg: '#dcfce7',
  dangerBg: '#fee2e2',
}

export const darkColors = {
  primary: '#60a5fa',
  primarySoft: '#172554',
  text: '#f8fafc',
  muted: '#94a3b8',
  border: '#334155',
  bg: '#0f172a',
  surface: '#111827',
  success: '#4ade80',
  danger: '#f87171',
  inputBg: '#1e293b',
  softSurface: '#1e293b',
  errorBg: '#3f1d24',
  errorBorder: '#7f1d1d',
  successBg: '#052e16',
  dangerBg: '#3f1d24',
}

export const colors = lightColors

export const createTheme = (isDark = false) => {
  const palette = isDark ? darkColors : lightColors
  const baseTheme = isDark ? MD3DarkTheme : MD3LightTheme

  return {
    ...baseTheme,
    roundness: 8,
    colors: {
      ...baseTheme.colors,
      primary: palette.primary,
      secondary: palette.primary,
      background: palette.bg,
      surface: palette.surface,
      outline: palette.border,
      onSurface: palette.text,
      onBackground: palette.text,
    },
  }
}

export const createNavigationTheme = (isDark = false) => {
  const palette = isDark ? darkColors : lightColors
  const baseTheme = isDark ? NavigationDarkTheme : NavigationDefaultTheme

  return {
    ...baseTheme,
    dark: isDark,
    colors: {
      ...baseTheme.colors,
      primary: palette.primary,
      background: palette.bg,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
  }
}

export const theme = createTheme(false)
