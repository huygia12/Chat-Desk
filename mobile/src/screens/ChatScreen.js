import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Chip,
  Dialog,
  Divider,
  Portal,
  Switch,
  Text,
} from 'react-native-paper'

import MessageBubble from '../components/MessageBubble'
import MessageComposer from '../components/MessageComposer'
import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useThemeStore } from '../store/themeStore'
import dayjs from 'dayjs'

export default function ChatScreen({ navigation, route }) {
  const { t } = useI18n()
  const listRef = useRef(null)
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const {
    activeConversation,
    messages,
    messagesLoading,
    olderMessagesLoading,
    messagesHasMore,
    aiTypingConversationIds,
    sending,
    loadOlderMessages,
    sendMessage,
    uploadMessageFile,
    markConversationRead,
    toggleAI,
    assignConversation,
    assignLabel,
    removeLabel,
  } = useChatStore()
  const [detailOpen, setDetailOpen] = useState(false)
  const [assigneeDialogOpen, setAssigneeDialogOpen] = useState(false)
  const [labelDialogOpen, setLabelDialogOpen] = useState(false)
  const [assignees, setAssignees] = useState([])
  const [labels, setLabels] = useState([])
  const [assignmentSettings, setAssignmentSettings] = useState(null)
  const [history, setHistory] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    if (activeConversation?.id) {
      markConversationRead(activeConversation.id)
    }
  }, [activeConversation?.id, markConversationRead])

  const title = route.params?.title || activeConversation?.contact?.display_name || t('chat.title')
  const contact = activeConversation?.contact || {}
  const assignedLabels = contact.labels || []
  const assignedLabelIds = useMemo(
    () => new Set(assignedLabels.map((label) => String(label.id))),
    [assignedLabels],
  )
  const employeeAssignmentLocked =
    user?.role === 'employee' && assignmentSettings?.employee_assignment_locked
  const activeAssigneeName =
    activeConversation?.assigned_to?.full_name ||
    activeConversation?.assigned_to?.email ||
    (activeConversation?.assigned_to_business ? t('chat.businessShop') : t('chat.unassigned'))
  const isAiTyping = aiTypingConversationIds.some(
    (id) => String(id) === String(activeConversation?.id),
  )

  useEffect(() => {
    if (messages.length || isAiTyping) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
    }
  }, [isAiTyping, messages.length])

  const fetchHistory = useCallback(async () => {
    if (!activeConversation?.id) return
    const res = await client.get(`/api/conversations/${activeConversation.id}/history`)
    setHistory(res.data)
  }, [activeConversation?.id])

  const fetchDetailData = useCallback(async () => {
    if (!activeConversation?.id) return
    setDetailLoading(true)
    setDetailError('')
    try {
      const [assigneeRes, settingRes, labelRes, historyRes] = await Promise.all([
        client.get('/api/assignments/assignees'),
        client.get('/api/assignments/settings'),
        client.get('/api/labels'),
        client.get(`/api/conversations/${activeConversation.id}/history`),
      ])
      setAssignees(assigneeRes.data)
      setAssignmentSettings(settingRes.data)
      setLabels(labelRes.data)
      setHistory(historyRes.data)
    } catch (error) {
      setDetailError(error.response?.data?.detail || t('chat.loadDetailsFailed'))
    } finally {
      setDetailLoading(false)
    }
  }, [activeConversation?.id])

  useEffect(() => {
    if (detailOpen) fetchDetailData()
  }, [detailOpen, fetchDetailData])

  const handleToggleAI = async (value) => {
    setActionLoading(true)
    setDetailError('')
    try {
      await toggleAI(value)
    } catch (error) {
      setDetailError(error.response?.data?.detail || t('chat.updateAIFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleAssignConversation = async (value) => {
    setActionLoading(true)
    setDetailError('')
    try {
      await assignConversation(value)
      await fetchHistory()
      setAssigneeDialogOpen(false)
    } catch (error) {
      setDetailError(error.response?.data?.detail || t('chat.updateAssignmentFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleAssignLabel = async (labelId) => {
    setActionLoading(true)
    setDetailError('')
    try {
      await assignLabel(labelId)
      await fetchHistory()
      setLabelDialogOpen(false)
    } catch (error) {
      setDetailError(error.response?.data?.detail || t('chat.assignLabelFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveLabel = async (labelId) => {
    setActionLoading(true)
    setDetailError('')
    try {
      await removeLabel(labelId)
      await fetchHistory()
    } catch (error) {
      setDetailError(error.response?.data?.detail || t('chat.removeLabelFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  const renderHistoryText = (event) => {
    if (event.type === 'conversation') return t('chat.conversationCreated')
    if (event.type === 'label') {
      return event.action === 'added'
        ? t('chat.labelAdded', { name: event.label_name || '' }).trim()
        : t('chat.labelRemoved', { name: event.label_name || '' }).trim()
    }
    if (event.action === 'assigned_business') return t('chat.assignedBusiness')
    if (event.action === 'unassigned') return t('chat.unassignedHistory')
    if (event.action === 'reassigned') {
      return t('chat.reassigned', {
        from: event.from_assignee_name || t('chat.unassigned'),
        to: event.to_assignee_name || t('chat.unassigned'),
      })
    }
    return t('chat.assignedTo', { name: event.to_assignee_name || t('employees.title') })
  }

  const renderDetailDialog = () => (
    <Portal>
      <Dialog visible={detailOpen} onDismiss={() => setDetailOpen(false)} style={styles.detailDialog}>
        <Dialog.Title>{t('chat.detailsTitle')}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.detailContent}>
            {detailLoading ? (
              <ActivityIndicator style={styles.detailLoading} />
            ) : (
              <>
                {detailError ? (
                  <View style={styles.errorBox}>
                    <Text variant="bodySmall" style={styles.errorText}>{detailError}</Text>
                  </View>
                ) : null}

                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <View>
                      <Text variant="titleSmall" style={styles.sectionTitle}>{t('chat.aiAuto')}</Text>
                      <Text variant="bodySmall" style={styles.sectionHint}>{t('chat.aiHint')}</Text>
                    </View>
                    <Switch
                      value={Boolean(activeConversation?.is_ai_enabled)}
                      disabled={actionLoading}
                      onValueChange={handleToggleAI}
                    />
                  </View>
                </View>

                <Divider />

                <View style={styles.detailSection}>
                  <Text variant="titleSmall" style={styles.sectionTitle}>{t('chat.assignment')}</Text>
                  <Text variant="bodyMedium" style={styles.primaryText}>{activeAssigneeName}</Text>
                  {employeeAssignmentLocked ? (
                    <Text variant="bodySmall" style={styles.sectionHint}>{t('chat.employeeLocked')}</Text>
                  ) : null}
                  <Button
                    mode="outlined"
                    icon="account-switch"
                    disabled={actionLoading || employeeAssignmentLocked}
                    onPress={() => setAssigneeDialogOpen(true)}
                    style={styles.sectionButton}
                  >
                    {t('chat.changeAssignment')}
                  </Button>
                </View>

                <Divider />

                <View style={styles.detailSection}>
                  <Text variant="titleSmall" style={styles.sectionTitle}>{t('chat.labels')}</Text>
                  <View style={styles.chipWrap}>
                    {assignedLabels.length === 0 ? (
                      <Text variant="bodySmall" style={styles.sectionHint}>{t('chat.noLabels')}</Text>
                    ) : (
                      assignedLabels.map((label) => (
                        <Chip
                          key={String(label.id)}
                          mode="flat"
                          onClose={() => handleRemoveLabel(label.id)}
                          disabled={actionLoading}
                          style={[styles.labelChip, { backgroundColor: label.color || colors.primarySoft }]}
                          textStyle={styles.labelText}
                        >
                          {label.name}
                        </Chip>
                      ))
                    )}
                  </View>
                  <Button
                    mode="outlined"
                    icon="label-plus"
                    disabled={actionLoading}
                    onPress={() => setLabelDialogOpen(true)}
                    style={styles.sectionButton}
                  >
                    {t('chat.addLabel')}
                  </Button>
                </View>

                <Divider />

                <View style={styles.detailSection}>
                  <Text variant="titleSmall" style={styles.sectionTitle}>{t('chat.contactInfo')}</Text>
                  {[
                    [t('chat.name'), contact.display_name || '-'],
                    ['Email', contact.visitor_email || '-'],
                    [t('chat.phone'), contact.visitor_phone || '-'],
                    ['Platform', activeConversation?.platform || contact.platform || '-'],
                    ['Visitor ID', contact.platform_user_id || '-'],
                  ].map(([label, value]) => (
                    <View key={label} style={styles.infoRow}>
                      <Text variant="bodySmall" style={styles.infoLabel}>{label}</Text>
                      <Text variant="bodySmall" selectable style={styles.infoValue}>{value}</Text>
                    </View>
                  ))}
                </View>

                <Divider />

                <View style={styles.detailSection}>
                  <Text variant="titleSmall" style={styles.sectionTitle}>{t('chat.history')}</Text>
                  {history.length === 0 ? (
                    <Text variant="bodySmall" style={styles.sectionHint}>{t('chat.noHistory')}</Text>
                  ) : (
                    history.map((event) => (
                      <View key={event.id} style={styles.historyItem}>
                        <Text variant="bodySmall" style={styles.primaryText}>{renderHistoryText(event)}</Text>
                        <Text variant="bodySmall" style={styles.sectionHint}>
                          {event.actor_name || event.actor_email || t('common.system')} - {dayjs(event.created_at).format('DD/MM/YYYY HH:mm')}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => setDetailOpen(false)}>{t('common.close')}</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={assigneeDialogOpen} onDismiss={() => setAssigneeDialogOpen(false)}>
        <Dialog.Title>{t('chat.changeAssignment')}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.optionList}>
            <Button
              mode={!activeConversation?.assigned_to_id && !activeConversation?.assigned_to_business ? 'contained-tonal' : 'text'}
              onPress={() => handleAssignConversation('__unassigned__')}
              disabled={actionLoading}
            >
              {t('chat.unassigned')}
            </Button>
            {assignees.map((assignee) => {
              const value = assignee.type === 'business' ? '__business__' : assignee.id
              const selected =
                value === '__business__'
                  ? activeConversation?.assigned_to_business
                  : String(activeConversation?.assigned_to_id) === String(value)
              return (
                <Button
                  key={assignee.id || 'business'}
                  mode={selected ? 'contained-tonal' : 'text'}
                  onPress={() => handleAssignConversation(value)}
                  disabled={actionLoading}
                >
                  {assignee.name}
                </Button>
              )
            })}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => setAssigneeDialogOpen(false)}>{t('common.cancel')}</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={labelDialogOpen} onDismiss={() => setLabelDialogOpen(false)}>
        <Dialog.Title>{t('chat.addLabel')}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.optionList}>
            {labels.length === 0 ? (
              <Text style={styles.sectionHint}>{t('chat.noLabelOptions')}</Text>
            ) : (
              labels.map((label) => {
                const assigned = assignedLabelIds.has(String(label.id))
                return (
                  <Button
                    key={String(label.id)}
                    mode={assigned ? 'contained-tonal' : 'text'}
                    disabled={assigned || actionLoading}
                    onPress={() => handleAssignLabel(label.id)}
                  >
                    {label.name}
                  </Button>
                )
              })
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => setLabelDialogOpen(false)}>{t('common.cancel')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={title} subtitle={activeConversation?.platform || ''} />
        <Appbar.Action icon="information-outline" onPress={() => setDetailOpen(true)} disabled={!activeConversation} />
      </Appbar.Header>

      {messagesLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messages}
          onScroll={({ nativeEvent }) => {
            if (nativeEvent.contentOffset.y < 32 && messagesHasMore && !olderMessagesLoading) {
              loadOlderMessages()
            }
          }}
          scrollEventThrottle={200}
          ListHeaderComponent={olderMessagesLoading ? <ActivityIndicator style={styles.older} /> : null}
          ListFooterComponent={isAiTyping ? (
            <View style={styles.aiTypingWrap}>
              <View style={styles.aiTypingBubble}>
                <Avatar.Icon size={30} icon="robot-outline" style={styles.aiTypingAvatar} />
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.aiTypingText}>{t('chat.aiTyping')}</Text>
              </View>
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('chat.empty')}</Text>
            </View>
          }
        />
      )}

      <MessageComposer sending={sending} onSend={sendMessage} onUpload={uploadMessageFile} />
      {renderDetailDialog()}
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: {
    paddingVertical: 10,
  },
  older: {
    marginVertical: 8,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
  },
  aiTypingWrap: {
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  aiTypingBubble: {
    maxWidth: '82%',
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.primary,
  },
  aiTypingAvatar: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  aiTypingText: {
    color: '#fff',
    fontWeight: '600',
  },
  detailDialog: {
    maxHeight: '92%',
  },
  detailContent: {
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  detailLoading: {
    marginVertical: 24,
  },
  detailSection: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  sectionHint: {
    color: colors.muted,
  },
  primaryText: {
    color: colors.text,
  },
  sectionButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  labelChip: {
    borderRadius: 8,
  },
  labelText: {
    color: '#111',
    fontWeight: '600',
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    color: colors.muted,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: colors.text,
  },
  historyItem: {
    gap: 2,
    paddingVertical: 4,
  },
  optionList: {
    gap: 6,
    paddingVertical: 8,
  },
  errorBox: {
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.errorBg,
  },
  errorText: {
    color: colors.danger,
  },
})
