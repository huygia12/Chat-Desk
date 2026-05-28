import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

import client, { setAccessToken } from '../api/client'

const TOKEN_KEY = 'chatdesk_mobile_token'

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  bootstrapped: false,

  loadSession: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    if (!token) {
      set({ bootstrapped: true })
      return
    }

    setAccessToken(token)
    set({ token })
    try {
      await get().fetchUser()
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY)
      setAccessToken(null)
      set({ token: null, user: null })
    } finally {
      set({ bootstrapped: true })
    }
  },

  login: async (email, password) => {
    const res = await client.post('/api/auth/login', { email, password })
    const token = res.data.access_token
    await SecureStore.setItemAsync(TOKEN_KEY, token)
    setAccessToken(token)
    set({ token })
    await get().fetchUser()
    const user = get().user
    if (!['business', 'employee'].includes(user?.role)) {
      await get().logout()
      throw new Error('auth.mobileOnly')
    }
  },

  register: async (email, password, businessName, phone) => {
    const res = await client.post('/api/auth/register', {
      email,
      password,
      business_name: businessName,
      phone,
    })
    const token = res.data.access_token
    await SecureStore.setItemAsync(TOKEN_KEY, token)
    setAccessToken(token)
    set({ token })
    await get().fetchUser()
  },

  fetchUser: async () => {
    const res = await client.get('/api/auth/me')
    set({ user: res.data })
    return res.data
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    setAccessToken(null)
    set({ token: null, user: null })
  },
}))
