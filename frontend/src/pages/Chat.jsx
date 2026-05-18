import { useEffect, useMemo, useRef, useState } from 'react'
import { List, Avatar, Typography, Input, Button, Spin, Switch, Badge, Empty, Select, message, Segmented, theme, Space, Tooltip, Popover } from 'antd'
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
} from '@ant-design/icons'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { useI18n } from '../i18n/useI18n'
import CustomerLabel from '../components/CustomerLabel'
import MessageMarkdown from '../components/MessageMarkdown'
import client from '../api/client'
import dayjs from 'dayjs'

const CONVERSATION_MIN_WIDTH = 240
const CONVERSATION_MAX_WIDTH = 420
const CONVERSATION_WIDTH_STORAGE_KEY = 'chatdesk_conversation_list_width'
const CONVERSATION_DETAIL_STORAGE_KEY = 'chatdesk_conversation_detail_open'
const MESSAGE_GROUP_WINDOW_MINUTES = 3
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
  const [conversationQueue, setConversationQueue] = useState('all')
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

  const scrollToLatestMessage = (behavior = 'auto') => {
    const container = messagesContainerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })
  }

  useEffect(() => {
    fetchConversations()
    fetchLabels()
    fetchAssignees()
    fetchAssignmentSettings()
    fetchSavedReplies()
  }, [])

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
  const visibleConversations = useMemo(() => {
    if (user?.role !== 'business') return conversations
    if (conversationQueue === 'unassigned') {
      return conversations.filter(
        (conversation) => !conversation.assigned_to_id && !conversation.assigned_to_business,
      )
    }
    if (conversationQueue === 'assigned') {
      return conversations.filter(
        (conversation) => conversation.assigned_to_id || conversation.assigned_to_business,
      )
    }
    return conversations
  }, [conversationQueue, conversations, user?.role])
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
    } catch {
      // Error handled in store
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
          <a
            href={msg.attachment_url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              width: 200,
              maxWidth: '100%',
              lineHeight: 0,
              flex: '0 0 auto',
            }}
          >
            <img
              src={msg.attachment_url}
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
          </a>
        </div>
      )
    }

    return (
      <div style={{ display: 'grid', gap: msg.content && msg.content !== fileName ? 8 : 0 }}>
        {msg.content && msg.content !== fileName && <MessageMarkdown>{msg.content}</MessageMarkdown>}
        <a
          href={msg.attachment_url}
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
      <div style={{ marginTop: 18, paddingBottom: 18 }}>
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
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Typography.Text strong>{t('chat.conversations')} ({conversations.length})</Typography.Text>
        </div>
        {user?.role === 'business' && (
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
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
          </div>
        )}
        {visibleConversations.length === 0 ? (
          <Empty description={t('chat.emptyConversations')} style={{ marginTop: 40 }} />
        ) : (
          <List
            dataSource={visibleConversations}
            renderItem={(conv) => (
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
                  title={conv.contact?.display_name || t('chat.unknown')}
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
            )}
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
        {activeConversationId ? (
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
          </aside>
      )}
    </div>
  )
}
