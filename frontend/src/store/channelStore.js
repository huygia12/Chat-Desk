import { create } from 'zustand'
import client from '../api/client'

export const useChannelStore = create((set) => ({
  channels: [],
  loading: false,

  fetchChannels: async () => {
    set({ loading: true })
    try {
      const res = await client.get('/api/channels')
      set({ channels: res.data })
    } catch (err) {
      console.error('Failed to fetch channels:', err)
    } finally {
      set({ loading: false })
    }
  },

  connectFacebook: async (data) => {
    const res = await client.post('/api/channels/facebook', data)
    set((state) => ({ channels: [res.data, ...state.channels] }))
    return res.data
  },

  connectInstagram: async (data) => {
    const res = await client.post('/api/channels/instagram', data)
    set((state) => ({ channels: [res.data, ...state.channels] }))
    return res.data
  },

  connectTelegram: async (botToken) => {
    const res = await client.post('/api/channels/telegram/connect', {
      access_token: botToken,
      platform_page_id: 'auto',  // Will be set by backend
    })
    set((state) => ({ channels: [res.data, ...state.channels] }))
    return res.data
  },

  disconnectChannel: async (channelId) => {
    await client.delete(`/api/channels/${channelId}`)
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== channelId),
    }))
  },
}))
