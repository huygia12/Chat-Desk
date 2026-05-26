import { useCallback, useEffect } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { Appbar, ActivityIndicator, Button, Searchbar, SegmentedButtons, Text } from 'react-native-paper'

import ConversationItem from '../components/ConversationItem'
import LanguageToggle from '../components/LanguageToggle'
import { useI18n } from '../i18n/useI18n'
import { connectChatSocket, disconnectChatSocket } from '../realtime/websocket'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { colors } from '../theme/theme'

export default function ConversationListScreen({ navigation }) {
  const { t } = useI18n()
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const {
    conversations,
    conversationsLoading,
    conversationsRefreshing,
    conversationsHasMore,
    filters,
    setFilters,
    fetchConversations,
    refreshConversations,
    openConversation,
    addMessage,
    markConversationRead,
  } = useChatStore()

  useEffect(() => {
    fetchConversations({ reset: true })
  }, [fetchConversations, filters.platform])

  useEffect(() => {
    const timer = setTimeout(() => fetchConversations({ reset: true }), 350)
    return () => clearTimeout(timer)
  }, [fetchConversations, filters.search])

  useEffect(() => {
    if (!token) return undefined
    connectChatSocket(token, (data) => {
      if (data.type === 'new_message') {
        addMessage({ ...data.message, conversation_id: data.conversation_id })
        if (useChatStore.getState().activeConversation?.id === data.conversation_id) {
          markConversationRead(data.conversation_id)
        }
        refreshConversations()
      }
    })
    return () => disconnectChatSocket()
  }, [addMessage, markConversationRead, refreshConversations, token])

  const handleOpen = useCallback(async (conversation) => {
    await openConversation(conversation)
    navigation.navigate('Chat', { title: conversation.contact?.display_name || t('chat.title') })
  }, [navigation, openConversation, t])

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title={t('conversations.title')} subtitle={user?.full_name || user?.business_name || user?.email} />
        <LanguageToggle compact />
        <Appbar.Action icon="logout" onPress={logout} />
      </Appbar.Header>

      <View style={styles.filters}>
        <Searchbar
          placeholder={t('conversations.searchPlaceholder')}
          value={filters.search}
          onChangeText={(search) => setFilters({ search })}
          style={styles.search}
          inputStyle={styles.searchInput}
        />
        <SegmentedButtons
          value={filters.platform}
          onValueChange={(platform) => setFilters({ platform })}
          buttons={[
            { value: '', label: t('conversations.allPlatforms') },
            { value: 'facebook', label: 'FB' },
            { value: 'instagram', label: 'IG' },
            { value: 'telegram', label: 'TG' },
            { value: 'widget', label: 'Web' },
          ]}
          density="small"
        />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ConversationItem conversation={item} onPress={() => handleOpen(item)} />
        )}
        onRefresh={refreshConversations}
        refreshing={conversationsRefreshing}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (conversationsHasMore) fetchConversations()
        }}
        ListEmptyComponent={!conversationsLoading ? (
          <View style={styles.empty}>
            <Text variant="titleMedium">{t('conversations.emptyTitle')}</Text>
            <Text variant="bodySmall" style={styles.emptyText}>{t('conversations.emptySubtitle')}</Text>
            <Button mode="outlined" onPress={refreshConversations}>{t('conversations.reload')}</Button>
          </View>
        ) : null}
        ListFooterComponent={conversationsLoading ? <ActivityIndicator style={styles.loading} /> : null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filters: {
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  search: {
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  searchInput: {
    minHeight: 44,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: 32,
  },
  emptyText: {
    color: colors.muted,
  },
  loading: {
    marginVertical: 16,
  },
})
