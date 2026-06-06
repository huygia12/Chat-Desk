import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { ActivityIndicator, Appbar, Avatar, IconButton, Surface, Text } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useThemeStore } from '../store/themeStore'

const HISTORY_PAGE_SIZE = 50
const BUBBLE_SIZE = 58
const EDGE_GAP = 14

const normalizeHistoryPage = (payload) => {
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

export default function AIAssistantBubble() {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const activeConversation = useChatStore((state) => state.activeConversation)
  const colors = useThemeStore((state) => state.colors)
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets])
  const position = useRef(new Animated.ValueXY({ x: width - BUBBLE_SIZE - 18, y: height - 180 })).current
  const dragStart = useRef({ x: width - BUBBLE_SIZE - 18, y: height - 180 })
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [question, setQuestion] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyNextCursor, setHistoryNextCursor] = useState(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  const canUseAssistant = user?.role === 'business' || user?.role === 'employee'
  const activeCustomerName =
    activeConversation?.contact?.display_name ||
    activeConversation?.contact?.visitor_email ||
    activeConversation?.contact?.visitor_phone ||
    activeConversation?.contact?.platform_user_id ||
    t('common.unknown')

  const clampPosition = (x, y) => ({
    x: Math.min(Math.max(EDGE_GAP, x), Math.max(EDGE_GAP, width - BUBBLE_SIZE - EDGE_GAP)),
    y: Math.min(
      Math.max(insets.top + EDGE_GAP, y),
      Math.max(insets.top + EDGE_GAP, height - BUBBLE_SIZE - Math.max(insets.bottom, EDGE_GAP) - 78),
    ),
  })

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          position.stopAnimation((value) => {
            dragStart.current = value
          })
        },
        onPanResponderMove: (_, gesture) => {
          position.setValue({
            x: dragStart.current.x + gesture.dx,
            y: dragStart.current.y + gesture.dy,
          })
        },
        onPanResponderRelease: (_, gesture) => {
          const next = clampPosition(dragStart.current.x + gesture.dx, dragStart.current.y + gesture.dy)
          Animated.spring(position, {
            toValue: next,
            useNativeDriver: false,
            friction: 8,
            tension: 70,
          }).start()

          if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) {
            setOpen(true)
          }
        },
      }),
    [height, insets.bottom, insets.top, position, width],
  )

  useEffect(() => {
    position.stopAnimation((value) => {
      const next = clampPosition(value.x, value.y)
      position.setValue(next)
      dragStart.current = next
    })
  }, [height, insets.bottom, insets.top, position, width])

  useEffect(() => {
    if (open) {
      fetchHistory()
    }
  }, [open])

  useEffect(() => {
    if (open && history.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
    }
  }, [history.length, open])

  const fetchHistory = async () => {
    setLoadingHistory(true)
    setError('')
    try {
      const res = await client.get('/api/ai-assistant/history', {
        params: { limit: HISTORY_PAGE_SIZE },
      })
      const page = normalizeHistoryPage(res.data)
      setHistory(page.items)
      setHistoryHasMore(page.has_more)
      setHistoryNextCursor(page.next_cursor)
    } catch (err) {
      setError(err.response?.data?.detail || t('aiAssistant.historyError'))
    } finally {
      setLoadingHistory(false)
    }
  }

  const loadOlderHistory = async () => {
    if (loadingHistory || loadingOlderHistory || !historyHasMore || !historyNextCursor) return

    setLoadingOlderHistory(true)
    setError('')
    try {
      const res = await client.get('/api/ai-assistant/history', {
        params: { limit: HISTORY_PAGE_SIZE, before: historyNextCursor },
      })
      const page = normalizeHistoryPage(res.data)
      setHistory((items) => {
        const existingIds = new Set(items.map((item) => String(item.id)))
        const olderItems = page.items.filter((item) => !existingIds.has(String(item.id)))
        return [...olderItems, ...items]
      })
      setHistoryHasMore(page.has_more)
      setHistoryNextCursor(page.next_cursor)
    } catch (err) {
      setError(err.response?.data?.detail || t('aiAssistant.historyError'))
    } finally {
      setLoadingOlderHistory(false)
    }
  }

  const submitAssistantQuestion = async (submittedQuestion, intent = 'ask', onError) => {
    const trimmedQuestion = submittedQuestion.trim()
    if (!trimmedQuestion || asking) return

    setAsking(true)
    setError('')
    try {
      const res = await client.post('/api/ai-assistant/ask', {
        question: trimmedQuestion,
        conversation_id: activeConversation?.id || undefined,
        intent,
      })
      setHistory((items) => [...items, res.data.user_message, res.data.assistant_message])
    } catch (err) {
      onError?.()
      setError(err.response?.data?.detail || t('aiAssistant.askError'))
    } finally {
      setAsking(false)
    }
  }

  const askAssistant = async () => {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || asking) return

    setQuestion('')
    submitAssistantQuestion(trimmedQuestion, 'ask', () => setQuestion(trimmedQuestion))
  }

  const summarizeActiveConversation = () => {
    if (!activeConversation?.id || asking) return

    submitAssistantQuestion(
      t('aiAssistant.summaryPrompt', { customer: activeCustomerName }),
      'summarize_conversation',
    )
  }

  if (!canUseAssistant) return null

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bubble,
          {
            transform: position.getTranslateTransform(),
          },
        ]}
      >
        <MaterialCommunityIcons name="robot-outline" size={29} color="#fff" />
      </Animated.View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modal}
        >
          <Appbar.Header mode="small" elevated>
            <Appbar.Content
              title={t('aiAssistant.title')}
              subtitle={
                activeConversation?.id
                  ? t('aiAssistant.activeConversationHint')
                  : t('aiAssistant.generalHint')
              }
            />
            <Appbar.Action icon="close" onPress={() => setOpen(false)} />
          </Appbar.Header>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <FlatList
            ref={listRef}
            data={history}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.history}
            onScroll={({ nativeEvent }) => {
              if (nativeEvent.contentOffset.y < 36) {
                loadOlderHistory()
              }
            }}
            scrollEventThrottle={200}
            ListHeaderComponent={loadingOlderHistory ? <ActivityIndicator style={styles.olderLoader} /> : null}
            ListEmptyComponent={
              loadingHistory ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="robot-outline" size={38} color={colors.muted} />
                  <Text style={styles.emptyTitle}>{t('aiAssistant.empty')}</Text>
                </View>
              )
            }
            renderItem={({ item }) => <AssistantMessage item={item} styles={styles} />}
            ListFooterComponent={
              asking ? (
                <View style={styles.thinkingRow}>
                  <Avatar.Icon size={30} icon="robot-outline" style={styles.assistantAvatar} />
                  <ActivityIndicator size="small" />
                  <Text style={styles.thinkingText}>{t('aiAssistant.thinking')}</Text>
                </View>
              ) : null
            }
          />

          <Surface elevation={3} style={styles.composer}>
            {activeConversation?.id ? (
              <Pressable
                accessibilityRole="button"
                disabled={asking}
                onPress={summarizeActiveConversation}
                style={({ pressed }) => [
                  styles.summaryChip,
                  asking ? styles.summaryChipDisabled : null,
                  pressed ? styles.summaryChipPressed : null,
                ]}
              >
                <MaterialCommunityIcons name="file-document-outline" size={17} color={colors.primary} />
                <Text numberOfLines={2} style={styles.summaryChipText}>
                  {t('aiAssistant.summaryAction', { customer: activeCustomerName })}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.inputRow}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder={t('aiAssistant.placeholder')}
                placeholderTextColor={colors.muted}
                multiline
                style={styles.input}
                editable={!asking}
              />
              <IconButton
                mode="contained"
                icon="send"
                size={22}
                disabled={!question.trim() || asking}
                onPress={askAssistant}
                style={styles.sendButton}
              />
            </View>
          </Surface>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function AssistantMessage({ item, styles }) {
  const isAssistant = item.role === 'assistant'

  return (
    <View style={[styles.messageRow, isAssistant ? styles.assistantRow : styles.userRow]}>
      {isAssistant ? (
        <Avatar.Icon size={32} icon="robot-outline" style={styles.assistantAvatar} />
      ) : null}
      <View style={[styles.messageBubble, isAssistant ? styles.assistantMessage : styles.userMessage]}>
        <Text style={[styles.messageText, isAssistant ? styles.assistantText : styles.userText]}>
          {item.content}
        </Text>
      </View>
      {!isAssistant ? (
        <Avatar.Icon size={32} icon="account-outline" style={styles.userAvatar} />
      ) : null}
    </View>
  )
}

const createStyles = (colors, insets) => StyleSheet.create({
  bubble: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 50,
    elevation: 12,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  modal: {
    flex: 1,
    paddingBottom: insets.bottom,
    backgroundColor: colors.bg,
  },
  errorBox: {
    margin: 12,
    marginBottom: 0,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorBg,
  },
  errorText: {
    color: colors.danger,
  },
  history: {
    flexGrow: 1,
    padding: 14,
    gap: 10,
  },
  center: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '600',
  },
  olderLoader: {
    paddingVertical: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantAvatar: {
    backgroundColor: colors.primary,
  },
  userAvatar: {
    backgroundColor: colors.success,
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  assistantMessage: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  userMessage: {
    backgroundColor: colors.primary,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  assistantText: {
    color: colors.text,
  },
  userText: {
    color: '#fff',
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
    paddingBottom: 8,
  },
  thinkingText: {
    color: colors.muted,
  },
  composer: {
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  summaryChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.inputBg,
  },
  summaryChipPressed: {
    opacity: 0.75,
  },
  summaryChipDisabled: {
    opacity: 0.55,
  },
  summaryChipText: {
    flexShrink: 1,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 12 : 9,
    paddingBottom: 9,
    borderRadius: 8,
    color: colors.text,
    backgroundColor: colors.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    fontSize: 16,
  },
  sendButton: {
    margin: 0,
    borderRadius: 8,
  },
})
