import { create } from 'zustand'
import client from '../api/client'

const MESSAGE_PAGE_SIZE = 50
const DEFAULT_CONVERSATION_FILTERS = {
  search: '',
  assignment: 'all',
  labelIds: [],
  platforms: [],
}

let conversationRequestSeq = 0

const normalizeMessagePage = (payload) => {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      has_more: false,
      next_cursor: null,
    }
  }

  return {
    items: payload?.items || [],
    has_more: Boolean(payload?.has_more),
    next_cursor: payload?.next_cursor || null,
  }
}

const normalizeConversationFilters = (filters = {}) => ({
  search: typeof filters.search === 'string' ? filters.search : '',
  assignment: filters.assignment || filters.queue || 'all',
  labelIds: Array.isArray(filters.labelIds) ? filters.labelIds.map(String).filter(Boolean) : [],
  platforms: Array.isArray(filters.platforms) ? filters.platforms.filter(Boolean) : [],
})

const buildConversationParams = (filters) => {
  const params = new URLSearchParams()
  const search = filters.search.trim()

  if (search) params.set('search', search)
  if (filters.assignment && filters.assignment !== 'all') {
    params.set('assignment', filters.assignment)
  }
  filters.labelIds.forEach((labelId) => params.append('label_ids', labelId))
  filters.platforms.forEach((platform) => params.append('platforms', platform))

  return params
}

export const useChatStore = create((set, get) => ({
  conversations: [],
  conversationFilters: DEFAULT_CONVERSATION_FILTERS,
  labels: [],
  assignees: [],
  assignmentSettings: null,
  activeConversationId: null,
  messages: [],
  messagesHasMore: false,
  messagesNextCursor: null,
  loading: false,
  loadingOlderMessages: false,
  labelsLoading: false,
  assigneesLoading: false,

  fetchConversations: async (filters) => {
    const activeFilters = normalizeConversationFilters(filters || get().conversationFilters)
    const requestId = ++conversationRequestSeq
    set({ loading: true, conversationFilters: activeFilters })
    try {
      const res = await client.get('/api/conversations', {
        params: buildConversationParams(activeFilters),
      })
      if (requestId === conversationRequestSeq) {
        set({ conversations: res.data })
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      if (requestId === conversationRequestSeq) {
        set({ loading: false })
      }
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
      set({
        activeConversationId: null,
        messages: [],
        messagesHasMore: false,
        messagesNextCursor: null,
        loadingOlderMessages: false,
      })
      return
    }
    set({
      activeConversationId: conversationId,
      messages: [],
      messagesHasMore: false,
      messagesNextCursor: null,
      loadingOlderMessages: false,
      loading: true,
    })
    try {
      const res = await client.get(`/api/conversations/${conversationId}/messages`, {
        params: { limit: MESSAGE_PAGE_SIZE },
      })
      const page = normalizeMessagePage(res.data)
      if (String(get().activeConversationId) !== String(conversationId)) return
      set({
        messages: page.items,
        messagesHasMore: page.has_more,
        messagesNextCursor: page.next_cursor,
      })
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    } finally {
      set({ loading: false })
    }
  },

  loadOlderMessages: async (conversationId) => {
    const { activeConversationId, messagesNextCursor, messagesHasMore, loadingOlderMessages } = get()
    if (
      !conversationId ||
      String(activeConversationId) !== String(conversationId) ||
      !messagesHasMore ||
      !messagesNextCursor ||
      loadingOlderMessages
    ) {
      return false
    }

    set({ loadingOlderMessages: true })
    try {
      const res = await client.get(`/api/conversations/${conversationId}/messages`, {
        params: { limit: MESSAGE_PAGE_SIZE, before: messagesNextCursor },
      })
      const page = normalizeMessagePage(res.data)
      if (String(get().activeConversationId) !== String(conversationId)) {
        set({ loadingOlderMessages: false })
        return false
      }

      set((state) => {
        const existingIds = new Set(state.messages.map((msg) => String(msg.id)))
        const olderMessages = page.items.filter((msg) => !existingIds.has(String(msg.id)))

        return {
          messages: [...olderMessages, ...state.messages],
          messagesHasMore: page.has_more,
          messagesNextCursor: page.next_cursor,
          loadingOlderMessages: false,
        }
      })
      return true
    } catch (err) {
      console.error('Failed to fetch older messages:', err)
      set({ loadingOlderMessages: false })
      return false
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

  uploadMessageFile: async (conversationId, file, content = '') => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('content', content)
      const res = await client.post(`/api/conversations/${conversationId}/messages/upload`, formData)
      set((state) => {
        const exists = state.messages.some((m) => String(m.id) === String(res.data.id))
        if (exists) return state
        return { messages: [...state.messages, res.data] }
      })
      get().fetchConversations()
      return res.data
    } catch (err) {
      console.error('Failed to upload message file:', err)
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

  assignConversation: async (conversationId, assignment) => {
    const payload = typeof assignment === 'object'
      ? assignment
      : { assigned_to_id: assignment, assigned_to_business: false }
    const res = await client.patch(`/api/conversations/${conversationId}/assignee`, payload)
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
