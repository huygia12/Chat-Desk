import { create } from 'zustand'
import client from '../api/client'

export const useChatStore = create((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  loading: false,

  fetchConversations: async () => {
    set({ loading: true })
    try {
      const res = await client.get('/api/conversations')
      set({ conversations: res.data })
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      set({ loading: false })
    }
  },

  setActiveConversation: async (conversationId) => {
    set({ activeConversationId: conversationId, messages: [], loading: true })
    try {
      const res = await client.get(`/api/conversations/${conversationId}/messages`)
      set({ messages: res.data })
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    } finally {
      set({ loading: false })
    }
  },

  sendMessage: async (conversationId, content) => {
    try {
      const res = await client.post(`/api/conversations/${conversationId}/messages`, { content })
      set((state) => ({ messages: [...state.messages, res.data] }))
      // Refresh conversations to update last_message_at
      get().fetchConversations()
    } catch (err) {
      console.error('Failed to send message:', err)
      throw err
    }
  },

  addMessage: (message) => {
    set((state) => {
      // Only add if it's for the active conversation
      if (message.conversation_id === state.activeConversationId) {
        // Avoid duplicates
        const exists = state.messages.some((m) => m.id === message.id)
        if (!exists) {
          return { messages: [...state.messages, message] }
        }
      }
      return state
    })
  },

  toggleAI: async (conversationId, isEnabled) => {
    try {
      await client.patch(`/api/conversations/${conversationId}/ai`, {
        is_ai_enabled: isEnabled,
      })
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, is_ai_enabled: isEnabled } : c,
        ),
      }))
    } catch (err) {
      console.error('Failed to toggle AI:', err)
    }
  },
}))
