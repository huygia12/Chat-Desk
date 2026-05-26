import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

import { setClientLanguage } from '../api/client'
import { defaultLanguage } from '../i18n/dictionaries'

const LANGUAGE_KEY = 'chatdesk_mobile_language'
const supportedLanguages = ['vi', 'en']

function normalizeLanguage(language) {
  return supportedLanguages.includes(language) ? language : defaultLanguage
}

export const useLanguageStore = create((set, get) => ({
  language: defaultLanguage,
  bootstrapped: false,

  loadLanguage: async () => {
    const savedLanguage = normalizeLanguage(await SecureStore.getItemAsync(LANGUAGE_KEY))
    setClientLanguage(savedLanguage)
    set({ language: savedLanguage, bootstrapped: true })
  },

  setLanguage: async (language) => {
    const nextLanguage = normalizeLanguage(language)
    await SecureStore.setItemAsync(LANGUAGE_KEY, nextLanguage)
    setClientLanguage(nextLanguage)
    set({ language: nextLanguage })
  },

  toggleLanguage: async () => {
    const nextLanguage = get().language === 'vi' ? 'en' : 'vi'
    await get().setLanguage(nextLanguage)
  },
}))
