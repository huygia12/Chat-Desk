import { useEffect, useRef } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Appbar, Text } from 'react-native-paper'

import MessageBubble from '../components/MessageBubble'
import MessageComposer from '../components/MessageComposer'
import { useChatStore } from '../store/chatStore'
import { colors } from '../theme/theme'

export default function ChatScreen({ navigation, route }) {
  const listRef = useRef(null)
  const {
    activeConversation,
    messages,
    messagesLoading,
    olderMessagesLoading,
    messagesHasMore,
    sending,
    loadOlderMessages,
    sendMessage,
    uploadMessageFile,
    markConversationRead,
  } = useChatStore()

  useEffect(() => {
    if (messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
    }
  }, [messages.length])

  useEffect(() => {
    if (activeConversation?.id) {
      markConversationRead(activeConversation.id)
    }
  }, [activeConversation?.id, markConversationRead])

  const title = route.params?.title || activeConversation?.contact?.display_name || 'Hoi thoai'

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={title} subtitle={activeConversation?.platform || ''} />
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Chua co tin nhan trong hoi thoai nay.</Text>
            </View>
          }
        />
      )}

      <MessageComposer sending={sending} onSend={sendMessage} onUpload={uploadMessageFile} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
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
})
