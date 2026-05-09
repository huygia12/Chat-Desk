import { useEffect, useRef, useState } from 'react'
import { List, Avatar, Typography, Input, Button, Spin, Switch, Badge, Empty, Divider } from 'antd'
import {
  SendOutlined,
  FacebookOutlined,
  InstagramOutlined,
  RobotOutlined,
  UserOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import dayjs from 'dayjs'

export default function Chat() {
  const {
    conversations,
    activeConversationId,
    messages,
    loading,
    fetchConversations,
    setActiveConversation,
    sendMessage,
    toggleAI,
    addMessage,
  } = useChatStore()

  const user = useAuthStore((s) => s.user)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  // Fetch conversations on mount (WebSocket is managed by Layout.jsx)
  useEffect(() => {
    fetchConversations()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeConv = conversations.find((c) => c.id === activeConversationId)

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

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* Conversation List */}
      <div
        style={{
          width: 320,
          borderRight: '1px solid #f0f0f0',
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
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {conv.platform} &middot;{' '}
                      {conv.last_message_at
                        ? dayjs(conv.last_message_at).format('HH:mm DD/MM')
                        : 'Mới'}
                    </Typography.Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>

      {/* Message Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeConversationId ? (
          <>
            {/* Chat Header */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <Typography.Text strong>
                  {activeConv?.contact?.display_name || 'Unknown'}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {getPlatformIcon(activeConv?.platform)} {activeConv?.platform}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text style={{ marginRight: 8 }}>AI tự động:</Typography.Text>
                <Switch
                  checked={activeConv?.is_ai_enabled}
                  onChange={(checked) => toggleAI(activeConversationId, checked)}
                  checkedChildren={<RobotOutlined />}
                />
              </div>
            </div>

            {/* Messages */}
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

            {/* Input */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid #f0f0f0',
                display: 'flex',
                gap: 8,
              }}
            >
              <Input
                placeholder="Nhập tin nhắn..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPressEnter={handleSend}
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
