import { create } from 'zustand'

import client from '../api/client'

const CONVERSATION_LIMIT = 25
const MESSAGE_LIMIT = 50

const conversationSortTime = (conversation) =>
  new Date(conversation.last_message_at || conversation.created_at || 0).getTime()

const sortConversationsByActivity = (conversations) =>
  [...conversations].sort((a, b) => {
    const timeDiff = conversationSortTime(b) - conversationSortTime(a)
    if (timeDiff !== 0) return timeDiff
    return String(b.id).localeCompare(String(a.id))
  })

const mergeIncomingContact = (conversation, contact) => {
  if (!contact) return conversation
  return {
    ...conversation,
    contact_id: contact.id || conversation.contact_id,
    contact: conversation.contact ? { ...conversation.contact, ...contact } : contact,
  }
}

const conversationMatchesFilters = (conversation, filters = {}) => {
  if (filters.platform && conversation.platform !== filters.platform) return false

  const search = filters.search?.trim().toLowerCase()
  if (search) {
    const contact = conversation.contact || {}
    const haystack = [
      contact.display_name,
      contact.platform_user_id,
      contact.visitor_email,
      contact.visitor_phone,
    ].filter(Boolean).join(' ').toLowerCase()
    if (!haystack.includes(search)) return false
  }

  return true
}

const applyMessageToConversation = (conversation, message, activeConversationId, contact) => {
  const isActive = String(conversation.id) === String(activeConversationId)
  const incomingFromContact = message.sender_type === 'contact'
  const unreadCount = isActive
    ? 0
    : incomingFromContact
      ? Number(conversation.unread_count || 0) + 1
      : Number(conversation.unread_count || 0)

  return mergeIncomingContact(
    {
      ...conversation,
      last_message_at: message.created_at || conversation.last_message_at,
      unread_count: unreadCount,
    },
    contact,
  )
}

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
  aiTypingConversationIds: [],

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

  getConversation: async (conversationId, options = {}) => {
    const res = await client.get(`/api/conversations/${conversationId}`)
    const conversation = res.data
    set((state) => {
      if (options.respectFilters && !conversationMatchesFilters(conversation, state.filters)) {
        return state
      }

      const exists = state.conversations.some((item) => String(item.id) === String(conversation.id))
      return {
        conversations: sortConversationsByActivity(exists
          ? state.conversations.map((item) => String(item.id) === String(conversation.id) ? conversation : item)
          : [conversation, ...state.conversations]),
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

  refreshActiveConversation: async () => {
    const conversation = get().activeConversation
    if (!conversation?.id) return null

    const res = await client.get(`/api/conversations/${conversation.id}`)
    const refreshed = res.data
    set((state) => ({
      activeConversation: refreshed,
      conversations: state.conversations.map((item) =>
        String(item.id) === String(refreshed.id) ? refreshed : item,
      ),
    }))
    return refreshed
  },

  toggleAI: async (isEnabled) => {
    const conversation = get().activeConversation
    if (!conversation?.id) return null

    const res = await client.patch(`/api/conversations/${conversation.id}/ai`, {
      is_ai_enabled: isEnabled,
    })
    const refreshed = res.data
    set((state) => ({
      activeConversation: refreshed,
      conversations: state.conversations.map((item) =>
        String(item.id) === String(refreshed.id) ? refreshed : item,
      ),
    }))
    return refreshed
  },

  assignConversation: async (assignmentValue) => {
    const conversation = get().activeConversation
    if (!conversation?.id) return null

    const assignedToId =
      assignmentValue === '__business__' || assignmentValue === '__unassigned__'
        ? null
        : assignmentValue
    const res = await client.patch(`/api/conversations/${conversation.id}/assignee`, {
      assigned_to_id: assignedToId,
      assigned_to_business: assignmentValue === '__business__',
    })
    const refreshed = res.data
    set((state) => ({
      activeConversation: refreshed,
      conversations: state.conversations.map((item) =>
        String(item.id) === String(refreshed.id) ? refreshed : item,
      ),
    }))
    return refreshed
  },

  assignLabel: async (labelId) => {
    const conversation = get().activeConversation
    if (!conversation?.contact_id || !labelId) return null

    const res = await client.post(`/api/contacts/${conversation.contact_id}/labels`, {
      label_id: labelId,
      conversation_id: conversation.id,
    })
    const labels = res.data.labels || []
    set((state) => ({
      activeConversation:
        state.activeConversation && String(state.activeConversation.id) === String(conversation.id)
          ? {
              ...state.activeConversation,
              contact: state.activeConversation.contact
                ? { ...state.activeConversation.contact, labels }
                : state.activeConversation.contact,
            }
          : state.activeConversation,
      conversations: state.conversations.map((item) =>
        String(item.contact_id) === String(conversation.contact_id)
          ? {
              ...item,
              contact: item.contact ? { ...item.contact, labels } : item.contact,
            }
          : item,
      ),
    }))
    return res.data
  },

  removeLabel: async (labelId) => {
    const conversation = get().activeConversation
    if (!conversation?.contact_id || !labelId) return null

    const res = await client.delete(
      `/api/contacts/${conversation.contact_id}/labels/${labelId}?conversation_id=${conversation.id}`,
    )
    const labels = res.data.labels || []
    set((state) => ({
      activeConversation:
        state.activeConversation && String(state.activeConversation.id) === String(conversation.id)
          ? {
              ...state.activeConversation,
              contact: state.activeConversation.contact
                ? { ...state.activeConversation.contact, labels }
                : state.activeConversation.contact,
            }
          : state.activeConversation,
      conversations: state.conversations.map((item) =>
        String(item.contact_id) === String(conversation.contact_id)
          ? {
              ...item,
              contact: item.contact ? { ...item.contact, labels } : item.contact,
            }
          : item,
      ),
    }))
    return res.data
  },

  setContactLabels: (contactId, labels) => {
    set((state) => ({
      activeConversation:
        state.activeConversation && String(state.activeConversation.contact_id) === String(contactId)
          ? {
              ...state.activeConversation,
              contact: state.activeConversation.contact
                ? { ...state.activeConversation.contact, labels }
                : state.activeConversation.contact,
            }
          : state.activeConversation,
      conversations: state.conversations.map((item) =>
        String(item.contact_id) === String(contactId)
          ? {
              ...item,
              contact: item.contact ? { ...item.contact, labels } : item.contact,
            }
          : item,
      ),
    }))
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
    } finally {
      set({ sending: false })
    }
  },

  addMessage: (message, options = {}) => {
    const conversationId = message.conversation_id
    const hasConversation = get().conversations.some(
      (conversation) => String(conversation.id) === String(conversationId),
    )

    set((state) => {
      const belongsToActive =
        state.activeConversation && String(conversationId) === String(state.activeConversation.id)
      const exists = state.messages.some((item) => String(item.id) === String(message.id))
      const nextTypingConversationIds = message.sender_type === 'ai'
        ? state.aiTypingConversationIds.filter((id) => String(id) !== String(conversationId))
        : state.aiTypingConversationIds
      const nextMessages = belongsToActive && !exists ? [...state.messages, message] : state.messages
      const nextActiveConversation = belongsToActive
        ? applyMessageToConversation(state.activeConversation, message, state.activeConversation.id, options.contact)
        : state.activeConversation
      const nextConversations = state.conversations.some((conversation) => String(conversation.id) === String(conversationId))
        ? sortConversationsByActivity(
            state.conversations.map((conversation) =>
              String(conversation.id) === String(conversationId)
                ? applyMessageToConversation(
                    conversation,
                    message,
                    state.activeConversation?.id,
                    options.contact,
                  )
                : conversation,
            ),
          )
        : state.conversations
      return {
        messages: nextMessages,
        activeConversation: nextActiveConversation,
        conversations: nextConversations,
        aiTypingConversationIds: nextTypingConversationIds,
      }
    })

    if (!hasConversation) {
      get().getConversation(conversationId, { respectFilters: true }).catch((error) => {
        console.warn('Failed to fetch incoming conversation:', error)
      })
    }

    const activeConversation = get().activeConversation
    if (
      activeConversation &&
      String(activeConversation.id) === String(conversationId) &&
      message.sender_type === 'contact'
    ) {
      get().markConversationRead(activeConversation.id)
    }
  },

  setAiTyping: (conversationId, isTyping) => {
    if (!conversationId) return
    set((state) => {
      const exists = state.aiTypingConversationIds.some((id) => String(id) === String(conversationId))
      if (isTyping && !exists) {
        return { aiTypingConversationIds: [...state.aiTypingConversationIds, String(conversationId)] }
      }
      if (!isTyping && exists) {
        return {
          aiTypingConversationIds: state.aiTypingConversationIds.filter(
            (id) => String(id) !== String(conversationId),
          ),
        }
      }
      return state
    })
  },
}))
