import { useEffect, useMemo, useRef, useState } from 'react'
import { List, Avatar, Typography, Input, Button, Spin, Switch, Badge, Empty, Select, message, Segmented, theme, Space, Tooltip, Popover, Modal } from 'antd'
import {
  SendOutlined,
  FacebookOutlined,
  InstagramOutlined,
  RobotOutlined,
  UserOutlined,
  ShopOutlined,
  InfoCircleOutlined,
  PaperClipOutlined,
  FileOutlined,
  SmileOutlined,
  SearchOutlined,
  FilterOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { useI18n } from '../i18n/useI18n'
import { useFileObjectUrl } from '../hooks/useFileObjectUrl'
import CustomerLabel from '../components/CustomerLabel'
import MessageMarkdown from '../components/MessageMarkdown'
import client from '../api/client'
import dayjs from 'dayjs'

const CONVERSATION_MIN_WIDTH = 240
const CONVERSATION_MAX_WIDTH = 420
const CONVERSATION_WIDTH_STORAGE_KEY = 'chatdesk_conversation_list_width'
const CONVERSATION_DETAIL_STORAGE_KEY = 'chatdesk_conversation_detail_open'
const CONVERSATION_FILTERS_STORAGE_KEY = 'chatdesk_conversation_filters'
const MESSAGE_GROUP_WINDOW_MINUTES = 3
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const EMOJI_OPTIONS = [
  '😀',
  '😄',
  '😊',
  '😍',
  '👍',
  '🙏',
  '🎉',
  '🔥',
  '❤️',
  '✅',
  '🤝',
  '💬',
  '📌',
  '⭐',
  '💡',
  '🚀',
]
const WIDGET_AVATAR_STYLE = {
  background: '#f0f7ff',
  color: '#1677ff',
  border: '1px solid #b7d8ff',
}

const PLATFORM_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  widget: 'Widget',
}

const getLabelTextColor = (hexColor) => {
  const hex = hexColor?.replace('#', '') || 'd6e400'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.58 ? '#111' : '#fff'
}

const resolveAttachmentUrl = (url) => {
  if (!url) return ''

  try {
    const parsed = new URL(url, API_URL)
    if (parsed.pathname.startsWith('/api/files/')) {
      return `${API_URL}${parsed.pathname}${parsed.search}`
    }
    return parsed.href
  } catch {
    return url
  }
}

function AttachmentImage({ alt, onClick, onLoad, src, style }) {
  const fileUrl = useFileObjectUrl(src)
  const imageSrc = fileUrl || src
  const [status, setStatus] = useState(imageSrc ? 'loading' : 'idle')
  const isLoading = status === 'loading'

  useEffect(() => {
    setStatus(imageSrc ? 'loading' : 'idle')
  }, [imageSrc])

  const handleLoad = (event) => {
    setStatus('loaded')
    onLoad?.(event)
  }

  const handleError = () => {
    setStatus('error')
  }

  return (
    <span
      onClick={onClick}
      style={{
        position: 'relative',
        display: style?.display === 'block' ? 'block' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: style?.width,
        maxWidth: style?.maxWidth,
        maxHeight: style?.maxHeight,
        minWidth: isLoading ? 120 : undefined,
        minHeight: isLoading ? 120 : undefined,
        aspectRatio: isLoading && (style?.height === 'auto' || !style?.height) ? '4 / 3' : undefined,
        borderRadius: style?.borderRadius,
        overflow: 'hidden',
        background: isLoading ? 'rgba(22, 119, 255, 0.08)' : 'transparent',
        cursor: onClick ? 'zoom-in' : undefined,
        verticalAlign: 'top',
      }}
    >
      {isLoading ? (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          <Spin size="small" />
        </span>
      ) : null}
      {status === 'error' ? (
        <span
          style={{
            width: '100%',
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8c8c8c',
            background: 'rgba(0, 0, 0, 0.04)',
            borderRadius: style?.borderRadius,
          }}
        >
          <FileOutlined />
        </span>
      ) : null}
      {imageSrc && status !== 'error' ? (
        <img
          src={imageSrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            ...style,
            position: isLoading ? 'absolute' : style?.position,
            inset: isLoading ? 0 : style?.inset,
            width: style?.width || '100%',
            height: isLoading ? '100%' : style?.height,
            opacity: isLoading || status === 'error' ? 0 : 1,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </span>
  )
}

const clampConversationWidth = (value) =>
  Math.min(CONVERSATION_MAX_WIDTH, Math.max(CONVERSATION_MIN_WIDTH, value))

const getStoredConversationWidth = () => {
  const fallbackWidth = 320
  if (typeof window === 'undefined') return fallbackWidth

  const stored = Number(window.localStorage.getItem(CONVERSATION_WIDTH_STORAGE_KEY))
  if (!Number.isFinite(stored)) return fallbackWidth
  return clampConversationWidth(stored)
}

const getStoredDetailCollapsed = () => {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(CONVERSATION_DETAIL_STORAGE_KEY) !== 'true'
}

const getStoredConversationFilters = () => {
  const fallback = {
    open: false,
    queue: 'all',
    search: '',
    labelIds: [],
    platforms: [],
  }
  if (typeof window === 'undefined') return fallback

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CONVERSATION_FILTERS_STORAGE_KEY))
    return {
      open: Boolean(parsed?.open),
      queue: ['all', 'unassigned', 'assigned'].includes(parsed?.queue) ? parsed.queue : fallback.queue,
      search: typeof parsed?.search === 'string' ? parsed.search : fallback.search,
      labelIds: Array.isArray(parsed?.labelIds) ? parsed.labelIds.map(String) : fallback.labelIds,
      platforms: Array.isArray(parsed?.platforms) ? parsed.platforms.filter(Boolean) : fallback.platforms,
    }
  } catch {
    return fallback
  }
}

export default function Chat() {
  const {
    conversations,
    labels,
    labelsLoading,
    assignees,
    assigneesLoading,
    assignmentSettings,
    activeConversationId,
    messages,
    messagesHasMore,
    loading,
    loadingOlderMessages,
    fetchConversations,
    fetchLabels,
    fetchAssignees,
    fetchAssignmentSettings,
    setActiveConversation,
    loadOlderMessages,
    sendMessage,
    uploadMessageFile,
    toggleAI,
    assignConversation,
    assignLabel,
    removeLabel,
  } = useChatStore()
  const user = useAuthStore((state) => state.user)

  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [assigningLabel, setAssigningLabel] = useState(false)
  const [labelSelectValue, setLabelSelectValue] = useState(undefined)
  const [labelSearchText, setLabelSearchText] = useState('')
  const [savedReplies, setSavedReplies] = useState([])
  const [replyPickerIndex, setReplyPickerIndex] = useState(0)
  const [conversationWidth, setConversationWidth] = useState(getStoredConversationWidth)
  const [detailCollapsed, setDetailCollapsed] = useState(getStoredDetailCollapsed)
  const [assigningConversation, setAssigningConversation] = useState(false)
  const [storedConversationFilters] = useState(getStoredConversationFilters)
  const [conversationQueue, setConversationQueue] = useState(storedConversationFilters.queue)
  const [conversationFiltersOpen, setConversationFiltersOpen] = useState(storedConversationFilters.open)
  const [conversationSearch, setConversationSearch] = useState(storedConversationFilters.search)
  const [selectedLabelIds, setSelectedLabelIds] = useState(storedConversationFilters.labelIds)
  const [selectedPlatforms, setSelectedPlatforms] = useState(storedConversationFilters.platforms)
  const [conversationHistory, setConversationHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const { t } = useI18n()
  const { token } = theme.useToken()
  const chatContainerRef = useRef(null)
  const resizingConversationRef = useRef(false)
  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const messageInputRef = useRef(null)
  const activeConversationRef = useRef(null)
  const previousFirstMessageIdRef = useRef(null)
  const previousLastMessageIdRef = useRef(null)
  const restoreScrollHeightRef = useRef(null)
  const conversationHistoryRequestRef = useRef(0)

  const scrollToLatestMessage = (behavior = 'auto') => {
    const container = messagesContainerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })
  }

  const fetchConversationHistory = async (conversationId = activeConversationId, options = {}) => {
    conversationHistoryRequestRef.current += 1
    const requestId = conversationHistoryRequestRef.current

    if (!conversationId) {
      setConversationHistory([])
      setHistoryLoading(false)
      return
    }

    if (!options.silent) setHistoryLoading(true)
    try {
      const res = await client.get(`/api/conversations/${conversationId}/history`)
      if (conversationHistoryRequestRef.current === requestId) {
        setConversationHistory(res.data)
      }
    } catch (err) {
      if (conversationHistoryRequestRef.current === requestId) {
        setConversationHistory([])
      }
      console.error('Failed to fetch conversation history:', err)
    } finally {
      if (conversationHistoryRequestRef.current === requestId) {
        setHistoryLoading(false)
      }
    }
  }

  const conversationFilterPayload = useMemo(() => ({
    search: conversationSearch,
    assignment: conversationQueue,
    labelIds: selectedLabelIds,
    platforms: selectedPlatforms,
  }), [conversationQueue, conversationSearch, selectedLabelIds, selectedPlatforms])

  useEffect(() => {
    if (!user?.id) return
    setActiveConversation(null)
    setConversationHistory([])
    setInputValue('')
    fetchLabels()
    fetchAssignees()
    fetchAssignmentSettings()
    fetchSavedReplies()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return

    const timer = window.setTimeout(() => {
      fetchConversations(conversationFilterPayload)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [user?.id, conversationFilterPayload, fetchConversations])

  useEffect(() => {
    fetchConversationHistory(activeConversationId)
  }, [activeConversationId])

  useEffect(() => {
    window.localStorage.setItem(
      CONVERSATION_FILTERS_STORAGE_KEY,
      JSON.stringify({
        open: conversationFiltersOpen,
        queue: conversationQueue,
        search: conversationSearch,
        labelIds: selectedLabelIds,
        platforms: selectedPlatforms,
      }),
    )
  }, [
    conversationFiltersOpen,
    conversationQueue,
    conversationSearch,
    selectedLabelIds,
    selectedPlatforms,
  ])

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container || !activeConversationId || loading || loadingOlderMessages || !messagesHasMore) return

    if (container.scrollTop <= 48) {
      restoreScrollHeightRef.current = container.scrollHeight
      loadOlderMessages(activeConversationId)
    }
  }

  useEffect(() => {
    const firstMessageId = messages[0]?.id || null
    const lastMessageId = messages[messages.length - 1]?.id || null
    const activeConversationChanged = activeConversationRef.current !== activeConversationId
    const loadedOlderMessages =
      !activeConversationChanged &&
      previousFirstMessageIdRef.current &&
      firstMessageId &&
      firstMessageId !== previousFirstMessageIdRef.current &&
      lastMessageId === previousLastMessageIdRef.current

    const restoreOrScroll = () => {
      const container = messagesContainerRef.current
      if (!container) return

      if (loadedOlderMessages && restoreScrollHeightRef.current != null) {
        container.scrollTop = container.scrollHeight - restoreScrollHeightRef.current
        restoreScrollHeightRef.current = null
        return
      }

      scrollToLatestMessage('auto')
    }

    restoreOrScroll()

    const frameId = window.requestAnimationFrame(restoreOrScroll)
    const timeoutId = window.setTimeout(restoreOrScroll, 120)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [activeConversationId, messages.length, messages[messages.length - 1]?.id])

  useEffect(() => {
    activeConversationRef.current = activeConversationId
    previousFirstMessageIdRef.current = messages[0]?.id || null
    previousLastMessageIdRef.current = messages[messages.length - 1]?.id || null
  }, [activeConversationId, messages])

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!resizingConversationRef.current) return
      const containerLeft = chatContainerRef.current?.getBoundingClientRect().left || 0
      const nextWidth = clampConversationWidth(event.clientX - containerLeft)
      setConversationWidth(nextWidth)
      window.localStorage.setItem(CONVERSATION_WIDTH_STORAGE_KEY, String(nextWidth))
    }

    const handleMouseUp = () => {
      if (!resizingConversationRef.current) return
      resizingConversationRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const platformOptions = useMemo(() => {
    return Object.keys(PLATFORM_LABELS).map((platform) => ({
      value: platform,
      label: PLATFORM_LABELS[platform] || platform,
    }))
  }, [])
  const visibleConversations = conversations
  const hasConversationFilters =
    conversationSearch.trim().length > 0 ||
    selectedLabelIds.length > 0 ||
    selectedPlatforms.length > 0 ||
    (user?.role === 'business' && conversationQueue !== 'all')
  const activeContactLabels = activeConv?.contact?.labels || []
  const assignedLabelIds = new Set(activeContactLabels.map((label) => label.id))
  const labelSelectorKey = `${activeConv?.contact_id || 'no-contact'}:${activeContactLabels
    .map((label) => label.id)
    .sort()
    .join(',')}`

  useEffect(() => {
    setLabelSelectValue(undefined)
    setLabelSearchText('')
  }, [activeConv?.contact_id])

  const updateDetailCollapsed = (nextValue) => {
    setDetailCollapsed(nextValue)
    window.localStorage.setItem(CONVERSATION_DETAIL_STORAGE_KEY, String(!nextValue))
  }

  const quickReplyQuery = inputValue.startsWith('/') ? inputValue.slice(1).toLowerCase() : null
  const filteredReplies = useMemo(() => {
    if (quickReplyQuery == null) return []
    return savedReplies
      .filter((reply) => {
        const haystack = `${reply.shortcut} ${reply.title} ${reply.content}`.toLowerCase()
        return haystack.includes(quickReplyQuery)
      })
      .slice(0, 20)
  }, [quickReplyQuery, savedReplies])
  const isReplyPickerOpen = quickReplyQuery != null && filteredReplies.length > 0
  const groupedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1]
      const next = messages[index + 1]
      const startsTimeBlock =
        !previous ||
        dayjs(message.created_at).diff(dayjs(previous.created_at), 'minute', true) >
          MESSAGE_GROUP_WINDOW_MINUTES
      const startsGroup =
        !previous ||
        previous.sender_type !== message.sender_type ||
        dayjs(message.created_at).diff(dayjs(previous.created_at), 'minute', true) >
          MESSAGE_GROUP_WINDOW_MINUTES
      const endsGroup =
        !next ||
        next.sender_type !== message.sender_type ||
        dayjs(next.created_at).diff(dayjs(message.created_at), 'minute', true) >
          MESSAGE_GROUP_WINDOW_MINUTES

      return {
        ...message,
        startsGroup,
        endsGroup,
        showTimeSeparator: startsTimeBlock,
      }
    })
  }, [messages])
  const employeeAssignmentLocked =
    user?.role === 'employee' && assignmentSettings?.employee_assignment_locked

  useEffect(() => {
    setReplyPickerIndex(0)
  }, [quickReplyQuery])

  const fetchSavedReplies = async () => {
    try {
      const res = await client.get('/api/saved-replies')
      setSavedReplies(res.data)
    } catch (err) {
      console.error('Failed to fetch saved replies:', err)
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim() || !activeConversationId) return
    setSending(true)
    try {
      await sendMessage(activeConversationId, inputValue.trim())
      setInputValue('')
    } catch (err) {
      message.error(err.response?.data?.detail || t('chat.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !activeConversationId) return

    setSending(true)
    try {
      await uploadMessageFile(activeConversationId, file, inputValue.trim())
      setInputValue('')
    } catch (err) {
      message.error(err.response?.data?.detail || t('chat.uploadFailed'))
    } finally {
      setSending(false)
    }
  }

  const applySavedReply = (reply) => {
    setInputValue(reply.content)
    setReplyPickerIndex(0)
  }

  const insertEmoji = (emoji) => {
    const input = messageInputRef.current?.input
    const selectionStart = input?.selectionStart ?? inputValue.length
    const selectionEnd = input?.selectionEnd ?? selectionStart
    const nextValue = `${inputValue.slice(0, selectionStart)}${emoji}${inputValue.slice(selectionEnd)}`

    setInputValue(nextValue)
    window.setTimeout(() => {
      const nextCursor = selectionStart + emoji.length
      messageInputRef.current?.focus()
      messageInputRef.current?.input?.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

  const handleInputKeyDown = (event) => {
    if (!isReplyPickerOpen) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setReplyPickerIndex((index) => (index + 1) % filteredReplies.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setReplyPickerIndex((index) => (index - 1 + filteredReplies.length) % filteredReplies.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      applySavedReply(filteredReplies[replyPickerIndex])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setInputValue('')
    }
  }

  const handleAssignLabel = async (labelId) => {
    if (!activeConv?.contact_id || !labelId) return
    setLabelSelectValue(labelId)
    setAssigningLabel(true)
    try {
      await assignLabel(activeConv.contact_id, labelId, activeConversationId)
      await fetchConversationHistory(activeConversationId, { silent: true })
    } catch (err) {
      message.error(err.response?.data?.detail || t('chat.assignLabelFailed'))
    } finally {
      setLabelSelectValue(undefined)
      setLabelSearchText('')
      setAssigningLabel(false)
    }
  }

  const handleRemoveLabel = async (label) => {
    if (!activeConv?.contact_id || !label?.id) return
    try {
      await removeLabel(activeConv.contact_id, label.id, activeConversationId)
      await fetchConversationHistory(activeConversationId, { silent: true })
      setLabelSelectValue(undefined)
      setLabelSearchText('')
    } catch (err) {
      message.error(err.response?.data?.detail || t('chat.removeLabelFailed'))
    }
  }

  const handleAssignConversation = async (assignmentValue) => {
    if (!activeConversationId) return
    setAssigningConversation(true)
    try {
      const assignedToId =
        assignmentValue === '__business__' || assignmentValue === '__unassigned__'
          ? null
          : assignmentValue
      await assignConversation(activeConversationId, {
        assigned_to_id: assignedToId,
        assigned_to_business: assignmentValue === '__business__',
      })
      if (user?.role !== 'employee' || assignedToId === user.id) {
        await fetchConversationHistory(activeConversationId, { silent: true })
      }
      await fetchConversations()
      if (user?.role === 'employee' && assignedToId !== user.id) {
        setActiveConversation(null)
      }
    } catch (err) {
      message.error(err.response?.data?.detail || t('chat.updateAssigneeFailed'))
    } finally {
      setAssigningConversation(false)
    }
  }

  const activeAssigneeName =
    activeConv?.assigned_to?.full_name ||
    activeConv?.assigned_to?.email ||
    (activeConv?.assigned_to_business ? t('chat.business') : t('chat.unassigned'))

  const activeAssignmentValue = activeConv?.assigned_to_id
    || (activeConv?.assigned_to_business ? '__business__' : '__unassigned__')

  const assigneeOptions = [
    { value: '__unassigned__', label: t('chat.unassigned') },
    ...assignees.map((assignee) => ({
      value: assignee.type === 'business' ? '__business__' : assignee.id,
      label: assignee.name,
    })),
  ]

  const getPlatformIcon = (platform) =>
    platform === 'facebook' ? (
      <FacebookOutlined style={{ color: '#1877F2' }} />
    ) : platform === 'telegram' ? (
      <SendOutlined style={{ color: '#0088cc' }} />
    ) : platform === 'widget' ? (
      <ShopOutlined style={{ color: '#1677ff' }} />
    ) : (
      <InstagramOutlined style={{ color: '#E4405F' }} />
    )

  const parseAllowedOrigins = (value) => {
    if (!value) return []
    if (Array.isArray(value)) return value
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const getWidgetFaviconUrl = (conv) => {
    if (conv?.platform !== 'widget') return null
    const origin = parseAllowedOrigins(conv.channel?.allowed_origins)
      .find((item) => item && item !== '*')
    if (!origin) return null

    try {
      const url = new URL(origin.startsWith('http') ? origin : `https://${origin}`)
      return `${url.origin}/favicon.ico`
    } catch {
      return null
    }
  }

  const getConversationAvatar = (conv, size = 'default') => {
    const widgetFaviconUrl = getWidgetFaviconUrl(conv)
    const avatarSrc = conv?.contact?.profile_pic_url || widgetFaviconUrl || undefined
    const isDefaultWidgetAvatar = conv?.platform === 'widget' && !avatarSrc

    return (
      <Avatar
        size={size}
        src={avatarSrc}
        icon={avatarSrc ? undefined : getPlatformIcon(conv?.platform)}
        style={isDefaultWidgetAvatar ? WIDGET_AVATAR_STYLE : undefined}
      />
    )
  }

  const getSenderIcon = (senderType) => {
    switch (senderType) {
      case 'contact':
        return getConversationAvatar(activeConv, 'small')
      case 'business':
        return <Avatar size="small" icon={<ShopOutlined />} style={{ background: '#1890ff' }} />
      case 'ai':
        return <Avatar size="small" icon={<RobotOutlined />} style={{ background: '#722ed1' }} />
      default:
        return <Avatar size="small" icon={<UserOutlined />} />
    }
  }

  const getMessageBubbleRadius = (msg) => {
    if (msg.startsGroup && msg.endsGroup) return 18

    const isContact = msg.sender_type === 'contact'
    const compactRadius = 6
    const fullRadius = 18

    if (isContact) {
      return {
        borderTopLeftRadius: msg.startsGroup ? fullRadius : compactRadius,
        borderTopRightRadius: fullRadius,
        borderBottomRightRadius: fullRadius,
        borderBottomLeftRadius: msg.endsGroup ? fullRadius : compactRadius,
      }
    }

    return {
      borderTopLeftRadius: fullRadius,
      borderTopRightRadius: msg.startsGroup ? fullRadius : compactRadius,
      borderBottomRightRadius: msg.endsGroup ? fullRadius : compactRadius,
      borderBottomLeftRadius: fullRadius,
    }
  }

  const formatMessageSeparatorTime = (value) => {
    const timestamp = dayjs(value)
    if (timestamp.isSame(dayjs(), 'day')) return timestamp.format('HH:mm')
    return timestamp.format('MMM D, YYYY, HH:mm')
  }

  const renderConversationLabels = (conv) => {
    const convLabels = conv.contact?.labels || []
    if (convLabels.length === 0) return null

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 }}>
        {convLabels.slice(0, 2).map((label) => (
          <CustomerLabel key={label.id} label={label} size="small" />
        ))}
        {convLabels.length > 2 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            +{convLabels.length - 2}
          </Typography.Text>
        )}
      </div>
    )
  }

  const renderLabelFilterTag = ({ value, closable, onClose }) => {
    const label = labels.find((item) => String(item.id) === String(value))
    if (!label) return null

    const background = label.color || '#d6e400'
    const color = getLabelTextColor(background)

    return (
      <span
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: 116,
          height: 20,
          marginInlineEnd: 4,
          padding: '0 6px',
          borderRadius: 999,
          background,
          color,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '20px',
          verticalAlign: 'middle',
        }}
        title={label.name}
      >
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label.name}
        </span>
        {closable && (
          <button
            type="button"
            aria-label={t('labelsPage.removeLabel', { name: label.name })}
            onClick={onClose}
            style={{
              width: 14,
              height: 14,
              flex: '0 0 14px',
              border: 0,
              borderRadius: '50%',
              padding: 0,
              background: 'rgba(0, 0, 0, 0.28)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 11,
              lineHeight: '14px',
            }}
          >
            x
          </button>
        )}
      </span>
    )
  }

  const renderDetailRow = (label, value, options = {}) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '84px 1fr',
        gap: 8,
        alignItems: 'start',
        marginTop: 8,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      {value ? (
        <Typography.Text
          copyable={options.copyable ? { text: String(value) } : false}
          style={{ fontSize: 12, wordBreak: 'break-word' }}
        >
          {value}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          -
        </Typography.Text>
      )}
    </div>
  )

  const isImageAttachmentMessage = (msg) =>
    Boolean(
      msg.attachment_url &&
        (msg.attachment_kind === 'image' || msg.attachment_mime_type?.startsWith('image/')),
    )

  const renderMessageContent = (msg) => {
    if (!msg.attachment_url) return <MessageMarkdown>{msg.content}</MessageMarkdown>

    const fileName = msg.attachment_filename || msg.content || 'attachment'
    const isImage = isImageAttachmentMessage(msg)
    const attachmentUrl = resolveAttachmentUrl(msg.attachment_url)

    if (isImage) {
      return (
        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: msg.sender_type === 'contact' ? 'flex-start' : 'flex-end',
            gap: msg.content && msg.content !== fileName ? 8 : 0,
            maxWidth: '100%',
          }}
        >
          {msg.content && msg.content !== fileName && <MessageMarkdown>{msg.content}</MessageMarkdown>}
          <button
            type="button"
            onClick={() => setImagePreview({ url: attachmentUrl, name: fileName })}
            style={{
              display: 'block',
              width: 200,
              maxWidth: '100%',
              lineHeight: 0,
              flex: '0 0 auto',
              border: 0,
              padding: 0,
              background: 'transparent',
              cursor: 'zoom-in',
            }}
          >
            <AttachmentImage
              src={attachmentUrl}
              alt={fileName}
              onLoad={() => scrollToLatestMessage('auto')}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                borderRadius: 8,
                objectFit: 'contain',
              }}
            />
          </button>
        </div>
      )
    }

    return (
      <div style={{ display: 'grid', gap: msg.content && msg.content !== fileName ? 8 : 0 }}>
        {msg.content && msg.content !== fileName && <MessageMarkdown>{msg.content}</MessageMarkdown>}
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 6,
            maxWidth: 260,
            color: token.colorText,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              background: token.colorFillTertiary,
            }}
          >
            <FileOutlined />
            <Typography.Text ellipsis style={{ maxWidth: 210 }}>
              {fileName}
            </Typography.Text>
          </span>
        </a>
      </div>
    )
  }

  const getMessageBubbleStyle = (msg) => {
    const isImageAttachment = isImageAttachmentMessage(msg)

    if (isImageAttachment) {
      return {
        maxWidth: 'calc(100% - 28px)',
        width: 'fit-content',
        minWidth: 0,
        padding: 0,
        borderRadius: 8,
        background: 'transparent',
        color: token.colorText,
        overflow: 'visible',
      }
    }

    return {
      maxWidth: '60%',
      minWidth: 0,
      padding: '8px 12px',
      borderRadius: 18,
      ...getMessageBubbleRadius(msg),
      color: token.colorText,
      background:
        msg.sender_type === 'contact'
          ? token.colorFillSecondary
          : msg.sender_type === 'ai'
            ? token.colorPrimaryBg
            : token.colorInfoBg,
    }
  }

  const emojiPicker = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 34px)',
        gap: 6,
      }}
    >
      {EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault()
            insertEmoji(emoji)
          }}
          style={{
            width: 34,
            height: 34,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 8,
            background: token.colorBgContainer,
            color: token.colorText,
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: '30px',
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  )

  const renderVisitorInfo = () => {
    const contact = activeConv?.contact
    if (!contact) return null

    const idLabel = activeConv?.platform === 'widget' ? t('chat.visitorId') : t('chat.platformId')

    return (
      <div style={{ marginTop: 18, paddingBottom: 18, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Typography.Text strong>{t('chat.visitorInfo')}</Typography.Text>
        <div style={{ marginTop: 8 }}>
          {renderDetailRow(t('chat.name'), contact.display_name)}
          {renderDetailRow('Email', contact.visitor_email, { copyable: Boolean(contact.visitor_email) })}
          {renderDetailRow(t('chat.phone'), contact.visitor_phone, { copyable: Boolean(contact.visitor_phone) })}
          {renderDetailRow(idLabel, contact.platform_user_id, { copyable: Boolean(contact.platform_user_id) })}
          {renderDetailRow(t('chat.channel'), activeConv?.channel?.page_name || activeConv?.platform)}
        </div>
      </div>
    )
  }

  const getHistoryActorText = (event) =>
    event.actor_name || event.actor_email || t('chat.system')

  const getAssigneeText = (event, direction) => {
    if (direction === 'from') {
      return event.from_assignee_name || event.from_assignee_email || t('chat.unassigned')
    }
    if (event.action === 'assigned_business') return t('chat.business')
    return event.to_assignee_name || event.to_assignee_email || t('chat.unassigned')
  }

  const getHistoryTitle = (event) => {
    if (event.type === 'conversation') return t('chat.historyConversationCreated')

    if (event.type === 'label') {
      return event.action === 'removed'
        ? t('chat.historyLabelRemoved', { label: event.label_name || t('chat.unknown') })
        : t('chat.historyLabelAdded', { label: event.label_name || t('chat.unknown') })
    }

    if (event.action === 'auto_assigned') {
      return t('chat.historyAutoAssigned', { assignee: getAssigneeText(event, 'to') })
    }
    if (event.action === 'assigned_business') {
      return t('chat.historyAssignedBusiness')
    }
    if (event.action === 'unassigned') {
      return t('chat.historyUnassigned')
    }
    if (event.action === 'reassigned') {
      return t('chat.historyReassigned', {
        from: getAssigneeText(event, 'from'),
        to: getAssigneeText(event, 'to'),
      })
    }
    return t('chat.historyAssigned', { assignee: getAssigneeText(event, 'to') })
  }

  const getHistoryDotColor = (event) => {
    if (event.type === 'label') return event.label_color || '#faad14'
    if (event.type === 'assignment') return '#1677ff'
    return token.colorSuccess
  }

  const renderConversationHistory = () => (
    <div style={{ marginTop: 18, paddingBottom: 8 }}>
      <Typography.Text strong>{t('chat.history')}</Typography.Text>
      <div style={{ marginTop: 12 }}>
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <Spin size="small" />
          </div>
        ) : conversationHistory.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('chat.noHistory')}
          </Typography.Text>
        ) : (
          <div>
            {conversationHistory.map((event, index) => {
              const isFirst = index === 0
              const isLast = index === conversationHistory.length - 1
              const dotColor = getHistoryDotColor(event)

              return (
                <div
                  key={event.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr',
                    gap: 10,
                    minHeight: 58,
                  }}
                >
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    {!isFirst && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: '50%',
                          width: 2,
                          background: token.colorBorder,
                        }}
                      />
                    )}
                    {!isLast && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '50%',
                          bottom: 0,
                          width: 2,
                          background: token.colorBorder,
                        }}
                      />
                    )}
                    <span
                      style={{
                        position: 'relative',
                        marginTop: 6,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: dotColor,
                        border: `2px solid ${token.colorBgContainer}`,
                        boxShadow: `0 0 0 2px ${dotColor}33`,
                      }}
                    />
                  </div>
                  <div style={{ paddingBottom: 14, minWidth: 0 }}>
                    <Typography.Text style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                      {getHistoryTitle(event)}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                      {dayjs(event.created_at).format('HH:mm DD/MM/YYYY')}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                      {t('chat.historyBy', { actor: getHistoryActorText(event) })}
                    </Typography.Text>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      ref={chatContainerRef}
      style={{ display: 'flex', height: 'calc(100vh - 64px)', background: token.colorBgContainer }}
    >
      <div
        style={{
          width: conversationWidth,
          minWidth: CONVERSATION_MIN_WIDTH,
          maxWidth: CONVERSATION_MAX_WIDTH,
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: token.colorBgContainer,
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Typography.Text strong>{t('chat.conversations')}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {visibleConversations.length}
              </Typography.Text>
            </div>
            <Tooltip title={t('chat.filters')}>
              <Badge dot={hasConversationFilters} offset={[-2, 3]}>
                <Button
                  type={conversationFiltersOpen ? 'primary' : 'text'}
                  size="small"
                  icon={<FilterOutlined />}
                  onClick={() => setConversationFiltersOpen((open) => !open)}
                  aria-label={t('chat.filters')}
                />
              </Badge>
            </Tooltip>
          </div>
        </div>
        {conversationFiltersOpen && (
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillQuaternary,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Typography.Text style={{ fontSize: 12, fontWeight: 600 }}>
                {t('chat.filters')}
              </Typography.Text>
              {hasConversationFilters && (
                <Button
                  type="text"
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={() => {
                    setConversationSearch('')
                    setSelectedLabelIds([])
                    setSelectedPlatforms([])
                    setConversationQueue('all')
                  }}
                  style={{ marginLeft: 'auto', paddingInline: 4, fontSize: 12 }}
                >
                  {t('chat.clearFilters')}
                </Button>
              )}
            </div>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Input
                allowClear
                prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                placeholder={t('chat.searchCustomerPlaceholder')}
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                style={{
                  borderRadius: 8,
                  background: token.colorBgContainer,
                }}
              />
              {user?.role === 'business' && (
                <Segmented
                  size="small"
                  value={conversationQueue}
                  onChange={setConversationQueue}
                  options={[
                    { label: t('chat.all'), value: 'all' },
                    { label: t('chat.unassigned'), value: 'unassigned' },
                    { label: t('chat.assigned'), value: 'assigned' },
                  ]}
                  block
                />
              )}
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                size="small"
                placeholder={t('chat.labelFilterPlaceholder')}
                value={selectedLabelIds}
                onChange={setSelectedLabelIds}
                loading={labelsLoading}
                optionFilterProp="searchText"
                tagRender={renderLabelFilterTag}
                style={{ width: '100%' }}
                options={labels.map((label) => ({
                  value: String(label.id),
                  searchText: label.name,
                  label: <CustomerLabel label={label} size="small" />,
                }))}
              />
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                size="middle"
                placeholder={t('chat.platformFilterPlaceholder')}
                value={selectedPlatforms}
                onChange={setSelectedPlatforms}
                optionFilterProp="label"
                style={{ width: '100%', minHeight: 32 }}
                options={platformOptions}
              />
            </Space>
          </div>
        )}
        {visibleConversations.length === 0 ? (
          <Empty
            description={
              conversations.length === 0
                ? t('chat.emptyConversations')
                : t('chat.noFilteredConversations')
            }
            style={{ marginTop: 40 }}
          />
        ) : (
          <List
            style={{ flex: 1, overflowY: 'auto' }}
            dataSource={visibleConversations}
            renderItem={(conv) => {
              const unreadCount = Number(conv.unread_count || 0)

              return (
                <List.Item
                  onClick={() => setActiveConversation(conv.id)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: conv.id === activeConversationId ? token.controlItemBgActive : 'transparent',
                    borderBottom: `1px solid ${token.colorSplit}`,
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <Badge dot={conv.is_ai_enabled} color="green">
                        {getConversationAvatar(conv)}
                      </Badge>
                    }
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Typography.Text
                          strong={unreadCount > 0}
                          ellipsis={{ tooltip: conv.contact?.display_name || t('chat.unknown') }}
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          {conv.contact?.display_name || t('chat.unknown')}
                        </Typography.Text>
                        {unreadCount > 0 ? (
                          <Badge
                            count={unreadCount}
                            overflowCount={99}
                            style={{
                              backgroundColor: token.colorError,
                              boxShadow: 'none',
                              fontWeight: 700,
                            }}
                          />
                        ) : null}
                      </div>
                    }
                    description={
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {conv.platform} &middot;{' '}
                          {conv.last_message_at
                            ? dayjs(conv.last_message_at).format('HH:mm DD/MM')
                            : t('chat.new')}
                        </Typography.Text>
                        {renderConversationLabels(conv)}
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        title={t('chat.resizeConversations')}
        onMouseDown={(event) => {
          event.preventDefault()
          resizingConversationRef.current = true
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
        style={{
          width: 6,
          flex: '0 0 6px',
          cursor: 'col-resize',
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillQuaternary,
        }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeConversationId && activeConv ? (
          <>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 180, flex: '1 1 240px', overflow: 'hidden' }}>
                <Space size={8} style={{ width: '100%', minWidth: 0 }} align="start">
                  {getConversationAvatar(activeConv)}
                  <span style={{ minWidth: 0, display: 'block', flex: 1 }}>
                    <Typography.Text
                      strong
                      ellipsis={{ tooltip: activeConv?.contact?.display_name || t('chat.unknown') }}
                      style={{ display: 'block', maxWidth: '100%' }}
                    >
                      {activeConv?.contact?.display_name || t('chat.unknown')}
                    </Typography.Text>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 0,
                        marginTop: 2,
                      }}
                    >
                      {getPlatformIcon(activeConv?.platform)}
                      <Typography.Text
                        type="secondary"
                        ellipsis
                        style={{ fontSize: 12, maxWidth: '100%' }}
                      >
                        {activeConv?.platform}
                      </Typography.Text>
                    </span>
                  </span>
                </Space>
              </div>
              <div
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <Typography.Text style={{ whiteSpace: 'nowrap' }}>{t('chat.aiAuto')}</Typography.Text>
                <Switch
                  checked={activeConv?.is_ai_enabled}
                  onChange={(checked) => toggleAI(activeConversationId, checked)}
                  checkedChildren={<RobotOutlined />}
                />
                <Tooltip title={detailCollapsed ? t('chat.openDetail') : t('chat.closeDetail')}>
                  <Button
                    size="small"
                    icon={<InfoCircleOutlined />}
                    type={detailCollapsed ? 'default' : 'primary'}
                    onClick={() => updateDetailCollapsed(!detailCollapsed)}
                  >
                    <span style={{ whiteSpace: 'nowrap' }}>{t('chat.detail')}</span>
                  </Button>
                </Tooltip>
              </div>
            </div>

            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              style={{ flex: 1, overflowY: 'auto', padding: '16px', background: token.colorBgContainer }}
            >
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: 40 }}>
                  <Spin />
                </div>
              ) : (
                <>
                  {loadingOlderMessages && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
                      <Spin size="small" />
                    </div>
                  )}
                  {groupedMessages.map((msg) => (
                    <div key={msg.id}>
                      {msg.showTimeSeparator && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '18px 0 12px',
                          }}
                        >
                          <Typography.Text
                            type="secondary"
                            style={{
                              fontSize: 12,
                              color: token.colorTextSecondary,
                              background: token.colorBgContainer,
                              padding: '0 10px',
                            }}
                          >
                            {formatMessageSeparatorTime(msg.created_at)}
                          </Typography.Text>
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: msg.sender_type === 'contact' ? 'flex-start' : 'flex-end',
                          marginTop: msg.startsGroup ? 2 : 2,
                          marginBottom: msg.endsGroup ? 10 : 2,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            gap: 4,
                            width: isImageAttachmentMessage(msg) ? 'fit-content' : '100%',
                            maxWidth: '100%',
                            minWidth: 0,
                            flexDirection: msg.sender_type === 'contact' ? 'row' : 'row-reverse',
                          }}
                        >
                          {msg.endsGroup ? (
                            getSenderIcon(msg.sender_type)
                          ) : (
                            <div style={{ width: 24, flex: '0 0 24px' }} />
                          )}
                          <div style={getMessageBubbleStyle(msg)}>
                            {renderMessageContent(msg)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                position: 'relative',
                background: token.colorBgContainer,
              }}
            >
              {isReplyPickerOpen && (
                <div
                  style={{
                    position: 'absolute',
                    left: 16,
                    right: 16,
                    bottom: 68,
                    maxHeight: 300,
                    overflowY: 'auto',
                    border: '1px solid #2f3036',
                    borderRadius: 8,
                    background: '#24252b',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                    zIndex: 20,
                  }}
                >
                  {filteredReplies.map((reply, index) => (
                    <button
                      key={reply.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        applySavedReply(reply)
                      }}
                      onMouseEnter={() => setReplyPickerIndex(index)}
                      style={{
                        width: '100%',
                        border: 0,
                        padding: '10px 14px',
                        display: 'grid',
                        gridTemplateColumns: '34px 1fr',
                        gap: 10,
                        textAlign: 'left',
                        background: index === replyPickerIndex ? '#31333b' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <Avatar
                        size={28}
                        icon={reply.visibility === 'business' ? <ShopOutlined /> : <UserOutlined />}
                        style={{
                          background: reply.visibility === 'business' ? '#1677ff' : '#52c41a',
                        }}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Typography.Text style={{ color: '#fff', fontWeight: 600 }}>
                            /{reply.shortcut}
                          </Typography.Text>
                          <Typography.Text style={{ color: '#b5bac1', fontSize: 12 }}>
                            {reply.title}
                          </Typography.Text>
                        </span>
                        <Typography.Text
                          style={{
                            display: 'block',
                            color: '#b5bac1',
                            fontSize: 12,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {reply.content}
                        </Typography.Text>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <Tooltip title={t('chat.attachFile')}>
                  <Button
                    icon={<PaperClipOutlined />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!activeConversationId || sending}
                    size="large"
                  />
                </Tooltip>
                <Popover content={emojiPicker} trigger="click" placement="topLeft">
                  <Button
                    icon={<SmileOutlined />}
                    disabled={!activeConversationId || sending}
                    size="large"
                    title={t('chat.addEmoji')}
                  />
                </Popover>
                <Input
                  ref={messageInputRef}
                  placeholder={t('chat.messagePlaceholder')}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onPressEnter={() => {
                    if (!isReplyPickerOpen) handleSend()
                  }}
                  size="large"
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSend}
                  loading={sending}
                  size="large"
                />
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Empty description={t('chat.pickConversation')} />
          </div>
        )}
      </div>
      {activeConversationId && !detailCollapsed && (
          <aside
            style={{
              width: 300,
              flex: '0 0 300px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              padding: 16,
              overflowY: 'auto',
              background: token.colorBgContainer,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text strong>{t('chat.detail')}</Typography.Text>
            </div>

            <div style={{ marginTop: 18, paddingBottom: 18, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Typography.Text strong>{t('chat.assignee')}</Typography.Text>
                {employeeAssignmentLocked && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('chat.assignmentLocked')}
                  </Typography.Text>
                )}
              </div>
              <Select
                showSearch
                disabled={employeeAssignmentLocked}
                loading={assigneesLoading || assigningConversation}
                value={activeAssignmentValue}
                onChange={handleAssignConversation}
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={assigneeOptions}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Avatar
                  size={24}
                  icon={activeConv?.assigned_to_id ? <UserOutlined /> : <ShopOutlined />}
                  style={{
                    background: activeConv?.assigned_to_id
                      ? '#52c41a'
                      : activeConv?.assigned_to_business
                        ? '#1677ff'
                        : token.colorTextQuaternary,
                  }}
                />
                <Typography.Text>{activeAssigneeName}</Typography.Text>
              </div>
            </div>

            <div style={{ marginTop: 18, paddingBottom: 18, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Typography.Text strong>{t('chat.labels')}</Typography.Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {activeContactLabels.length === 0 ? (
                  <Typography.Text type="secondary">{t('chat.noLabels')}</Typography.Text>
                ) : (
                  activeContactLabels.map((label) => (
                    <CustomerLabel
                      key={label.id}
                      label={label}
                      closable
                      onClose={handleRemoveLabel}
                    />
                  ))
                )}
              </div>
              <Select
                key={labelSelectorKey}
                size="small"
                showSearch
                placeholder={t('chat.addLabel')}
                value={labelSelectValue}
                searchValue={labelSearchText}
                optionFilterProp="label"
                filterOption={(input, option) =>
                  String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                }
                loading={labelsLoading || assigningLabel}
                onSearch={setLabelSearchText}
                onChange={handleAssignLabel}
                onDropdownVisibleChange={(open) => {
                  if (!open) setLabelSearchText('')
                }}
                style={{ width: '100%' }}
                options={labels.map((label) => ({
                  value: label.id,
                  label: label.name,
                  disabled: assignedLabelIds.has(label.id),
                }))}
              />
            </div>
            {renderVisitorInfo()}
            {renderConversationHistory()}
          </aside>
      )}
      <Modal
        open={Boolean(imagePreview)}
        footer={null}
        centered
        width="100vw"
        closable={false}
        maskClosable
        styles={{
          content: {
            background: 'rgba(0,0,0,0.94)',
            boxShadow: 'none',
            padding: 0,
          },
          body: {
            minHeight: '90vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          },
        }}
        onCancel={() => setImagePreview(null)}
      >
        <Button
          type="text"
          shape="circle"
          icon={<CloseCircleOutlined />}
          onClick={() => setImagePreview(null)}
          style={{
            position: 'fixed',
            top: 22,
            right: 22,
            zIndex: 2100,
            width: 44,
            height: 44,
            color: '#fff',
            background: 'rgba(255,255,255,0.16)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
          }}
        />
        {imagePreview ? (
          <AttachmentImage
            src={imagePreview.url}
            alt={imagePreview.name}
            style={{
              maxWidth: '100%',
              maxHeight: '88vh',
              objectFit: 'contain',
              borderRadius: 8,
            }}
          />
        ) : null}
      </Modal>
    </div>
  )
}
