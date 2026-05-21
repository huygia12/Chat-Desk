import { create } from 'zustand'

import client from '../api/client'

const CONVERSATION_LIMIT = 25
const MESSAGE_LIMIT = 50

export const useChatStore = create((set, get) => ({
  conversations: [],
  conversationsCursor: null,
  conversationsHasMore: true,
  conversationsLoading: false,
  conversationsRefreshing: false,
  filters: {
    search: '',
    platform: '',
  },

  activeConversation: null,
  messages: [],
  messagesCursor: null,
  messagesHasMore: false,
  messagesLoading: false,
  olderMessagesLoading: false,
  sending: false,

  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),

  fetchConversations: async ({ reset = false, refreshing = false } = {}) => {
    const state = get()
    if (state.conversationsLoading || (!reset && !state.conversationsHasMore)) return
    set({ conversationsLoading: !refreshing, conversationsRefreshing: refreshing })
    try {
      const params = {
        limit: CONVERSATION_LIMIT,
      }
      const cursor = reset ? null : state.conversationsCursor
      if (cursor) params.cursor = cursor
      if (state.filters.search?.trim()) params.search = state.filters.search.trim()
      if (state.filters.platform) params.platform = state.filters.platform

      const res = await client.get('/api/conversations/page', { params })
      set((current) => ({
        conversations: reset ? res.data.items : [...current.conversations, ...res.data.items],
        conversationsCursor: res.data.next_cursor,
        conversationsHasMore: Boolean(res.data.has_more),
      }))
    } finally {
      set({ conversationsLoading: false, conversationsRefreshing: false })
    }
  },

  refreshConversations: async () => {
    await get().fetchConversations({ reset: true, refreshing: true })
  },

  getConversation: async (conversationId) => {
    const res = await client.get(`/api/conversations/${conversationId}`)
    const conversation = res.data
    set((state) => {
      const exists = state.conversations.some((item) => String(item.id) === String(conversation.id))
      return {
        conversations: exists
          ? state.conversations.map((item) => String(item.id) === String(conversation.id) ? conversation : item)
          : [conversation, ...state.conversations],
      }
    })
    return conversation
  },

  openConversation: async (conversation) => {
    set({
      activeConversation: { ...conversation, unread_count: 0 },
      messages: [],
      messagesCursor: null,
      messagesHasMore: false,
      messagesLoading: true,
      olderMessagesLoading: false,
    })
    try {
      const res = await client.get(`/api/conversations/${conversation.id}/messages`, {
        params: { limit: MESSAGE_LIMIT },
      })
      set({
        messages: res.data.items || [],
        messagesCursor: res.data.next_cursor,
        messagesHasMore: Boolean(res.data.has_more),
      })
      await get().markConversationRead(conversation.id)
    } finally {
      set({ messagesLoading: false })
    }
  },

  openConversationById: async (conversationId) => {
    const conversation = await get().getConversation(conversationId)
    await get().openConversation(conversation)
    return conversation
  },

  markConversationRead: async (conversationId) => {
    if (!conversationId) return
    try {
      await client.post(`/api/conversations/${conversationId}/read`)
      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          String(conversation.id) === String(conversationId)
            ? { ...conversation, unread_count: 0 }
            : conversation,
        ),
        activeConversation:
          state.activeConversation && String(state.activeConversation.id) === String(conversationId)
            ? { ...state.activeConversation, unread_count: 0 }
            : state.activeConversation,
      }))
    } catch (error) {
      console.warn('Failed to mark conversation read:', error)
    }
  },

  loadOlderMessages: async () => {
    const state = get()
    if (!state.activeConversation || !state.messagesHasMore || !state.messagesCursor || state.olderMessagesLoading) return
    set({ olderMessagesLoading: true })
    try {
      const res = await client.get(`/api/conversations/${state.activeConversation.id}/messages`, {
        params: { limit: MESSAGE_LIMIT, before: state.messagesCursor },
      })
      const existingIds = new Set(get().messages.map((message) => String(message.id)))
      const older = (res.data.items || []).filter((message) => !existingIds.has(String(message.id)))
      set((current) => ({
        messages: [...older, ...current.messages],
        messagesCursor: res.data.next_cursor,
        messagesHasMore: Boolean(res.data.has_more),
      }))
    } finally {
      set({ olderMessagesLoading: false })
    }
  },

  sendMessage: async (content) => {
    const conversation = get().activeConversation
    if (!conversation || !content.trim()) return
    set({ sending: true })
    try {
      const res = await client.post(`/api/conversations/${conversation.id}/messages`, {
        content: content.trim(),
      })
      get().addMessage(res.data)
      get().refreshConversations()
    } finally {
      set({ sending: false })
    }
  },

  uploadMessageFile: async (asset, content = '') => {
    const conversation = get().activeConversation
    if (!conversation || !asset?.uri) return

    const formData = new FormData()
    formData.append('file', {
      uri: asset.uri,
      name: asset.name || asset.fileName || 'attachment',
      type: asset.mimeType || asset.type || 'application/octet-stream',
    })
    formData.append('content', content)

    set({ sending: true })
    try {
      const res = await client.post(`/api/conversations/${conversation.id}/messages/upload`, formData)
      get().addMessage(res.data)
      get().refreshConversations()
    } finally {
      set({ sending: false })
    }
  },

  addMessage: (message) => {
    set((state) => {
      const belongsToActive =
        state.activeConversation && String(message.conversation_id) === String(state.activeConversation.id)
      const exists = state.messages.some((item) => String(item.id) === String(message.id))
      return {
        messages: belongsToActive && !exists ? [...state.messages, message] : state.messages,
        conversations: belongsToActive && message.sender_type === 'contact'
          ? state.conversations.map((conversation) =>
              String(conversation.id) === String(message.conversation_id)
                ? { ...conversation, unread_count: 0 }
                : conversation,
            )
          : state.conversations,
      }
    })
    const activeConversation = get().activeConversation
    if (
      activeConversation &&
      String(activeConversation.id) === String(message.conversation_id) &&
      message.sender_type === 'contact'
    ) {
      get().markConversationRead(activeConversation.id)
    }
  },
}))
