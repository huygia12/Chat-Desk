import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import client from '../api/client'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      login: async (email, password) => {
        const res = await client.post('/api/auth/login', { email, password })
        set({ token: res.data.access_token })
        await get().fetchUser()
      },

      register: async (email, password, business_name, phone) => {
        const res = await client.post('/api/auth/register', {
          email,
          password,
          business_name,
          phone,
        })
        set({ token: res.data.access_token })
        await get().fetchUser()
      },

      fetchUser: async () => {
        try {
          const res = await client.get('/api/auth/me')
          set({ user: res.data })
        } catch {
          set({ token: null, user: null })
        }
      },

      logout: () => {
        set({ token: null, user: null })
      },
    }),
    { name: 'chatdesk-auth' },
  ),
)
