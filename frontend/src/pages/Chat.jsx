import { useEffect, useMemo, useRef, useState } from 'react'
import { List, Avatar, Typography, Input, Button, Spin, Switch, Badge, Empty, Select, message } from 'antd'
import {
  SendOutlined,
  FacebookOutlined,
  InstagramOutlined,
  RobotOutlined,
  UserOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useChatStore } from '../store/chatStore'
import CustomerLabel from '../components/CustomerLabel'
import client from '../api/client'
import dayjs from 'dayjs'

const CONVERSATION_MIN_WIDTH = 240
const CONVERSATION_MAX_WIDTH = 420

export default function Chat() {
  const {
    conversations,
    labels,
    labelsLoading,
    activeConversationId,
    messages,
    loading,
    fetchConversations,
    fetchLabels,
    setActiveConversation,
    sendMessage,
    toggleAI,
    assignLabel,
    removeLabel,
  } = useChatStore()

  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [assigningLabel, setAssigningLabel] = useState(false)
  const [labelSelectValue, setLabelSelectValue] = useState(undefined)
  const [labelSearchText, setLabelSearchText] = useState('')
  const [savedReplies, setSavedReplies] = useState([])
  const [replyPickerIndex, setReplyPickerIndex] = useState(0)
  const [conversationWidth, setConversationWidth] = useState(320)
  const chatContainerRef = useRef(null)
  const resizingConversationRef = useRef(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    fetchConversations()
    fetchLabels()
    fetchSavedReplies()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!resizingConversationRef.current) return
      const containerLeft = chatContainerRef.current?.getBoundingClientRect().left || 0
      const nextWidth = Math.min(
        CONVERSATION_MAX_WIDTH,
        Math.max(CONVERSATION_MIN_WIDTH, event.clientX - containerLeft),
      )
      setConversationWidth(nextWidth)
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

  const applySavedReply = (reply) => {
    setInputValue(reply.content)
    setReplyPickerIndex(0)
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
      await assignLabel(activeConv.contact_id, labelId)
    } catch (err) {
      message.error(err.response?.data?.detail || 'Gán label thất bại')
    } finally {
      setLabelSelectValue(undefined)
      setLabelSearchText('')
      setAssigningLabel(false)
    }
  }

  const handleRemoveLabel = async (label) => {
    if (!activeConv?.contact_id || !label?.id) return
    try {
      await removeLabel(activeConv.contact_id, label.id)
      setLabelSelectValue(undefined)
      setLabelSearchText('')
    } catch (err) {
      message.error(err.response?.data?.detail || 'Gỡ label thất bại')
    }
  }

  const getPlatformIcon = (platform) =>
    platform === 'facebook' ? (
      <FacebookOutlined style={{ color: '#1877F2' }} />
    ) : platform === 'telegram' ? (
      <SendOutlined style={{ color: '#0088cc' }} />
    ) : (
      <InstagramOutlined style={{ color: '#E4405F' }} />
    )

  const getSenderIcon = (senderType) => {
    switch (senderType) {
      case 'contact':
        return <Avatar size="small" icon={<UserOutlined />} style={{ background: '#87d068' }} />
      case 'business':
        return <Avatar size="small" icon={<ShopOutlined />} style={{ background: '#1890ff' }} />
      case 'ai':
        return <Avatar size="small" icon={<RobotOutlined />} style={{ background: '#722ed1' }} />
      default:
        return <Avatar size="small" icon={<UserOutlined />} />
    }
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

  return (
    <div ref={chatContainerRef} style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      <div
        style={{
          width: conversationWidth,
          minWidth: CONVERSATION_MIN_WIDTH,
          maxWidth: CONVERSATION_MAX_WIDTH,
          flex: '0 0 auto',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Typography.Text strong>Hội thoại ({conversations.length})</Typography.Text>
        </div>
        {conversations.length === 0 ? (
          <Empty description="Chưa có hội thoại" style={{ marginTop: 40 }} />
        ) : (
          <List
            dataSource={conversations}
            renderItem={(conv) => (
              <List.Item
                onClick={() => setActiveConversation(conv.id)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: conv.id === activeConversationId ? '#e6f7ff' : 'transparent',
                  borderBottom: '1px solid #f5f5f5',
                }}
              >
                <List.Item.Meta
                  avatar={
                    <Badge dot={conv.is_ai_enabled} color="green">
                      <Avatar icon={getPlatformIcon(conv.platform)} />
                    </Badge>
                  }
                  title={conv.contact?.display_name || 'Unknown'}
                  description={
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {conv.platform} &middot;{' '}
                        {conv.last_message_at
                          ? dayjs(conv.last_message_at).format('HH:mm DD/MM')
                          : 'Mới'}
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
        title="Kéo để đổi độ rộng danh sách hội thoại"
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
          borderLeft: '1px solid #f0f0f0',
          borderRight: '1px solid #f0f0f0',
          background: '#fafafa',
        }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeConversationId ? (
          <>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Text strong>
                  {activeConv?.contact?.display_name || 'Unknown'}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {getPlatformIcon(activeConv?.platform)} {activeConv?.platform}
                </Typography.Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  {activeContactLabels.map((label) => (
                    <CustomerLabel
                      key={label.id}
                      label={label}
                      closable
                      onClose={handleRemoveLabel}
                    />
                  ))}
                  <Select
                    key={labelSelectorKey}
                    size="small"
                    showSearch
                    placeholder="Thêm label"
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
                    style={{ width: 180 }}
                    options={labels.map((label) => ({
                      value: label.id,
                      label: label.name,
                      disabled: assignedLabelIds.has(label.id),
                    }))}
                  />
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Typography.Text style={{ marginRight: 8 }}>AI tự động:</Typography.Text>
                <Switch
                  checked={activeConv?.is_ai_enabled}
                  onChange={(checked) => toggleAI(activeConversationId, checked)}
                  checkedChildren={<RobotOutlined />}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: 40 }}>
                  <Spin />
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: msg.sender_type === 'contact' ? 'flex-start' : 'flex-end',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 8,
                        flexDirection: msg.sender_type === 'contact' ? 'row' : 'row-reverse',
                      }}
                    >
                      {getSenderIcon(msg.sender_type)}
                      <div
                        style={{
                          maxWidth: '60%',
                          padding: '8px 12px',
                          borderRadius: 12,
                          background:
                            msg.sender_type === 'contact'
                              ? '#f0f0f0'
                              : msg.sender_type === 'ai'
                                ? '#f3e8ff'
                                : '#e6f7ff',
                        }}
                      >
                        <div>{msg.content}</div>
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 10, display: 'block', marginTop: 4 }}
                        >
                          {msg.sender_type === 'ai' ? 'AI' : msg.sender_type === 'business' ? 'Bạn' : ''}{' '}
                          {dayjs(msg.created_at).format('HH:mm')}
                        </Typography.Text>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid #f0f0f0',
                position: 'relative',
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
                <Input
                  placeholder="Nhập tin nhắn..."
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
            <Empty description="Chọn một hội thoại để bắt đầu" />
          </div>
        )}
      </div>
    </div>
  )
}
