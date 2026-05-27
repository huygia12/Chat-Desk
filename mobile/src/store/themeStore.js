import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

import { darkColors, lightColors } from '../theme/theme'

const THEME_KEY = 'chatdesk_mobile_theme'

const resolveTheme = (value) => (value === 'dark' ? 'dark' : 'light')

export const useThemeStore = create((set, get) => ({
  mode: 'light',
  isDark: false,
  colors: lightColors,
  bootstrapped: false,

  loadTheme: async () => {
    const stored = resolveTheme(await SecureStore.getItemAsync(THEME_KEY))
    set({
      mode: stored,
      isDark: stored === 'dark',
      colors: stored === 'dark' ? darkColors : lightColors,
      bootstrapped: true,
    })
  },

  setMode: async (mode) => {
    const nextMode = resolveTheme(mode)
    await SecureStore.setItemAsync(THEME_KEY, nextMode)
    set({
      mode: nextMode,
      isDark: nextMode === 'dark',
      colors: nextMode === 'dark' ? darkColors : lightColors,
    })
  },

  toggleTheme: async () => {
    await get().setMode(get().isDark ? 'light' : 'dark')
  },
}))
