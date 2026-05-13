import { create } from 'zustand'
import client from '../api/client'

export const useChatStore = create((set, get) => ({
  conversations: [],
  labels: [],
  assignees: [],
  assignmentSettings: null,
  activeConversationId: null,
  messages: [],
  loading: false,
  labelsLoading: false,
  assigneesLoading: false,

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

  fetchLabels: async () => {
    set({ labelsLoading: true })
    try {
      const res = await client.get('/api/labels')
      set({ labels: res.data })
    } catch (err) {
      console.error('Failed to fetch labels:', err)
    } finally {
      set({ labelsLoading: false })
    }
  },

  fetchAssignees: async () => {
    set({ assigneesLoading: true })
    try {
      const res = await client.get('/api/assignments/assignees')
      set({ assignees: res.data })
    } catch (err) {
      console.error('Failed to fetch assignees:', err)
    } finally {
      set({ assigneesLoading: false })
    }
  },

  fetchAssignmentSettings: async () => {
    try {
      const res = await client.get('/api/assignments/settings')
      set({ assignmentSettings: res.data })
      return res.data
    } catch (err) {
      console.error('Failed to fetch assignment settings:', err)
      return null
    }
  },

  setActiveConversation: async (conversationId) => {
    if (!conversationId) {
      set({ activeConversationId: null, messages: [] })
      return
    }
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
      // Dedup check: WS push from backend may have already added this message
      set((state) => {
        const exists = state.messages.some((m) => String(m.id) === String(res.data.id))
        if (exists) return state
        return { messages: [...state.messages, res.data] }
      })
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
      if (String(message.conversation_id) === String(state.activeConversationId)) {
        // Avoid duplicates (use String() to safely compare UUIDs from different sources)
        const exists = state.messages.some((m) => String(m.id) === String(message.id))
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

  assignConversation: async (conversationId, assignedToId) => {
    const res = await client.patch(`/api/conversations/${conversationId}/assignee`, {
      assigned_to_id: assignedToId,
    })
    set((state) => ({
      conversations: state.conversations
        .map((conversation) => (conversation.id === conversationId ? res.data : conversation)),
    }))
    return res.data
  },

  setContactLabels: (contactId, labels) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        String(conversation.contact_id) === String(contactId)
          ? {
              ...conversation,
              contact: conversation.contact
                ? { ...conversation.contact, labels }
                : conversation.contact,
            }
          : conversation,
      ),
    }))
  },

  assignLabel: async (contactId, labelId, conversationId) => {
    const res = await client.post(`/api/contacts/${contactId}/labels`, {
      label_id: labelId,
      conversation_id: conversationId,
    })
    get().setContactLabels(contactId, res.data.labels || [])
    return res.data
  },

  removeLabel: async (contactId, labelId, conversationId) => {
    const suffix = conversationId ? `?conversation_id=${conversationId}` : ''
    const res = await client.delete(`/api/contacts/${contactId}/labels/${labelId}${suffix}`)
    get().setContactLabels(contactId, res.data.labels || [])
    return res.data
  },
}))
