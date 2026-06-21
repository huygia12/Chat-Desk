import { useCallback, useEffect, useMemo } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { Appbar, ActivityIndicator, Button, Searchbar, SegmentedButtons, Text } from 'react-native-paper'

import BottomNavBar from '../components/BottomNavBar'
import ConversationItem from '../components/ConversationItem'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useThemeStore } from '../store/themeStore'

export default function ConversationListScreen({ navigation }) {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
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
  } = useChatStore()

  useEffect(() => {
    fetchConversations({ reset: true })
  }, [fetchConversations, filters.platform])

  useEffect(() => {
    const timer = setTimeout(() => fetchConversations({ reset: true }), 350)
    return () => clearTimeout(timer)
  }, [fetchConversations, filters.search])

  const handleOpen = useCallback(async (conversation) => {
    await openConversation(conversation)
    navigation.navigate('Chat', { title: conversation.contact?.display_name || t('chat.title') })
  }, [navigation, openConversation, t])

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content
          title="ChatDesk"
          subtitle={user?.full_name || user?.business_name || user?.email}
          titleStyle={styles.brandTitle}
        />
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
      <BottomNavBar active="Conversations" navigation={navigation} />
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  brandTitle: {
    color: colors.primary,
    fontWeight: '800',
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
    backgroundColor: colors.inputBg,
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
