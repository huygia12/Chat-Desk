import { create } from 'zustand'
import client from '../api/client'

const MESSAGE_PAGE_SIZE = 50
const MESSAGE_CACHE_TTL_MS = 2 * 60 * 1000
const MESSAGE_CACHE_MAX_CONVERSATIONS = 30
const DEFAULT_CONVERSATION_FILTERS = {
  search: '',
  assignment: 'all',
  labelIds: [],
  platforms: [],
}

let conversationRequestSeq = 0

const initialState = {
  conversations: [],
  conversationFilters: DEFAULT_CONVERSATION_FILTERS,
  labels: [],
  assignees: [],
  assignmentSettings: null,
  activeConversationId: null,
  messageCache: {},
  messages: [],
  messagesHasMore: false,
  messagesNextCursor: null,
  aiTypingConversationIds: [],
  loading: false,
  loadingOlderMessages: false,
  labelsLoading: false,
  assigneesLoading: false,
}

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

const messageSortTime = (message) => new Date(message.created_at || 0).getTime()

const sortMessagesByTime = (messages) =>
  [...messages].sort((a, b) => {
    const timeDiff = messageSortTime(a) - messageSortTime(b)
    if (timeDiff !== 0) return timeDiff
    return String(a.id).localeCompare(String(b.id))
  })

const mergeMessages = (currentMessages = [], incomingMessages = []) => {
  if (incomingMessages.length === 0) return currentMessages

  const byId = new Map(currentMessages.map((message) => [String(message.id), message]))
  let changed = false

  incomingMessages.forEach((message) => {
    const id = String(message.id)
    if (!byId.has(id)) {
      changed = true
      byId.set(id, message)
    }
  })

  if (!changed) return currentMessages
  return sortMessagesByTime(Array.from(byId.values()))
}

const touchMessageCache = (cache, conversationId, patch) => {
  const key = String(conversationId)
  const now = Date.now()
  const existing = cache[key] || {
    items: [],
    hasMore: false,
    nextCursor: null,
    loadedAt: 0,
    lastAccessedAt: 0,
  }
  const nextCache = {
    ...cache,
    [key]: {
      ...existing,
      ...patch,
      lastAccessedAt: now,
    },
  }

  const entries = Object.entries(nextCache)
  if (entries.length <= MESSAGE_CACHE_MAX_CONVERSATIONS) return nextCache

  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => Number(b.lastAccessedAt || 0) - Number(a.lastAccessedAt || 0))
      .slice(0, MESSAGE_CACHE_MAX_CONVERSATIONS),
  )
}

const isMessageCacheStale = (entry) =>
  !entry?.loadedAt || Date.now() - Number(entry.loadedAt) > MESSAGE_CACHE_TTL_MS

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

const conversationMatchesFilters = (conversation, filters = DEFAULT_CONVERSATION_FILTERS) => {
  const normalized = normalizeConversationFilters(filters)
  const search = normalized.search.trim().toLowerCase()

  if (normalized.platforms.length > 0 && !normalized.platforms.includes(conversation.platform)) {
    return false
  }

  if (normalized.assignment === 'unassigned') {
    if (conversation.assigned_to_id || conversation.assigned_to_business) return false
  } else if (normalized.assignment === 'assigned') {
    if (!conversation.assigned_to_id && !conversation.assigned_to_business) return false
  }

  if (normalized.labelIds.length > 0) {
    const assignedLabelIds = new Set((conversation.contact?.labels || []).map((label) => String(label.id)))
    if (!normalized.labelIds.every((labelId) => assignedLabelIds.has(String(labelId)))) return false
  }

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
  ...initialState,

  resetChatState: () => {
    conversationRequestSeq += 1
    set(initialState)
  },

  fetchConversations: async (filters, options = {}) => {
    const activeFilters = normalizeConversationFilters(filters || get().conversationFilters)
    const requestId = options.silent ? conversationRequestSeq : ++conversationRequestSeq
    set({
      conversationFilters: activeFilters,
      ...(options.silent ? {} : { loading: true }),
    })
    try {
      const res = await client.get('/api/conversations', {
        params: buildConversationParams(activeFilters),
      })
      if (requestId === conversationRequestSeq) {
        const conversations = res.data || []
        const activeConversationId = get().activeConversationId
        const activeConversationStillVisible = conversations.some(
          (conversation) => String(conversation.id) === String(activeConversationId),
        )

        set({
          conversations,
          ...(!activeConversationStillVisible
            ? {
                activeConversationId: null,
                messages: [],
                messagesHasMore: false,
                messagesNextCursor: null,
                loadingOlderMessages: false,
              }
            : {}),
        })
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      if (requestId === conversationRequestSeq && !options.silent) {
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

  fetchConversation: async (conversationId, options = {}) => {
    if (!conversationId) return null
    try {
      const res = await client.get(`/api/conversations/${conversationId}`)
      const conversation = res.data
      set((state) => {
        if (options.respectFilters && !conversationMatchesFilters(conversation, state.conversationFilters)) {
          return state
        }

        const exists = state.conversations.some((item) => String(item.id) === String(conversation.id))
        return {
          conversations: sortConversationsByActivity(
            exists
              ? state.conversations.map((item) =>
                  String(item.id) === String(conversation.id) ? conversation : item,
                )
              : [conversation, ...state.conversations],
          ),
        }
      })
      return conversation
    } catch (err) {
      console.error('Failed to fetch conversation:', err)
      return null
    }
  },

  fetchLatestMessages: async (conversationId, options = {}) => {
    if (!conversationId) return null
    const cacheKey = String(conversationId)
    if (!options.silent) set({ loading: true })

    try {
      const res = await client.get(`/api/conversations/${conversationId}/messages`, {
        params: { limit: MESSAGE_PAGE_SIZE },
      })
      const page = normalizeMessagePage(res.data)
      const now = Date.now()

      set((state) => {
        const existingEntry = state.messageCache[cacheKey]
        const existingItems = existingEntry?.items || []
        const nextItems = options.mergeWithCache
          ? mergeMessages(existingItems, page.items)
          : page.items
        const nextCache = touchMessageCache(state.messageCache, cacheKey, {
          items: nextItems,
          hasMore: page.has_more,
          nextCursor: existingEntry?.items?.length > page.items.length && existingEntry?.nextCursor
            ? existingEntry.nextCursor
            : page.next_cursor,
          loadedAt: now,
        })

        if (String(state.activeConversationId) !== cacheKey) {
          return { messageCache: nextCache }
        }

        return {
          messageCache: nextCache,
          messages: nextItems,
          messagesHasMore: nextCache[cacheKey]?.hasMore || false,
          messagesNextCursor: nextCache[cacheKey]?.nextCursor || null,
        }
      })

      return page
    } catch (err) {
      console.error('Failed to fetch messages:', err)
      return null
    } finally {
      if (!options.silent && String(get().activeConversationId) === cacheKey) {
        set({ loading: false })
      }
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
    const cacheKey = String(conversationId)
    const cached = get().messageCache[cacheKey]
    const hasCache = Boolean(cached)

    set({
      activeConversationId: conversationId,
      conversations: get().conversations.map((conversation) =>
        String(conversation.id) === String(conversationId)
          ? { ...conversation, unread_count: 0 }
          : conversation,
      ),
      messageCache: cached
        ? touchMessageCache(get().messageCache, cacheKey, {})
        : get().messageCache,
      messages: hasCache ? cached.items : [],
      messagesHasMore: hasCache ? cached.hasMore : false,
      messagesNextCursor: hasCache ? cached.nextCursor : null,
      loadingOlderMessages: false,
      loading: !hasCache,
    })

    get().markConversationRead(conversationId)

    if (!hasCache) {
      await get().fetchLatestMessages(conversationId)
      return
    }

    if (isMessageCacheStale(cached)) {
      get().fetchLatestMessages(conversationId, { silent: true, mergeWithCache: true })
    }
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
      }))
    } catch (err) {
      console.error('Failed to mark conversation read:', err)
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
        const cacheKey = String(conversationId)
        const currentItems = state.messageCache[cacheKey]?.items || state.messages
        const nextItems = mergeMessages(currentItems, page.items)
        const nextCache = touchMessageCache(state.messageCache, cacheKey, {
          items: nextItems,
          hasMore: page.has_more,
          nextCursor: page.next_cursor,
        })

        return {
          messageCache: nextCache,
          messages: nextItems,
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
      get().addMessage(res.data)
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
      get().addMessage(res.data)
      return res.data
    } catch (err) {
      console.error('Failed to upload message file:', err)
      throw err
    }
  },

  addMessage: (message, options = {}) => {
    const conversationId = message.conversation_id
    const hasConversation = get().conversations.some(
      (conversation) => String(conversation.id) === String(conversationId),
    )

    set((state) => {
      const nextTypingConversationIds = message.sender_type === 'ai'
        ? state.aiTypingConversationIds.filter((id) => String(id) !== String(message.conversation_id))
        : state.aiTypingConversationIds
      const belongsToActive = String(conversationId) === String(state.activeConversationId)
      const exists = state.messages.some((m) => String(m.id) === String(message.id))
      const cacheKey = String(conversationId)
      const existingCacheEntry = state.messageCache[cacheKey]
      const shouldUpdateCache = Boolean(existingCacheEntry) || belongsToActive
      const nextCacheItems = shouldUpdateCache
        ? mergeMessages(existingCacheEntry?.items || state.messages, [message])
        : null
      const nextMessageCache = shouldUpdateCache
        ? touchMessageCache(state.messageCache, cacheKey, {
            items: nextCacheItems,
            hasMore: existingCacheEntry?.hasMore ?? state.messagesHasMore,
            nextCursor: existingCacheEntry?.nextCursor ?? state.messagesNextCursor,
            loadedAt: Date.now(),
          })
        : state.messageCache
      const nextMessages = belongsToActive
        ? (nextMessageCache[cacheKey]?.items || (exists ? state.messages : [...state.messages, message]))
        : state.messages
      const nextConversations = state.conversations.some((conversation) => String(conversation.id) === String(conversationId))
        ? sortConversationsByActivity(
            state.conversations.map((conversation) =>
              String(conversation.id) === String(conversationId)
                ? applyMessageToConversation(conversation, message, state.activeConversationId, options.contact)
                : conversation,
            ),
          )
        : state.conversations

      if (
        nextMessages !== state.messages ||
        nextConversations !== state.conversations ||
        nextMessageCache !== state.messageCache ||
        nextTypingConversationIds !== state.aiTypingConversationIds
      ) {
        return {
          messageCache: nextMessageCache,
          messages: nextMessages,
          conversations: nextConversations,
          aiTypingConversationIds: nextTypingConversationIds,
        }
      }
      return state
    })

    if (!hasConversation) {
      get().fetchConversation(conversationId, { respectFilters: true })
    }

    if (
      String(conversationId) === String(get().activeConversationId) &&
      message.sender_type === 'contact'
    ) {
      get().markConversationRead(conversationId)
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
