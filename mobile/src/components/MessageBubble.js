import { Linking, StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'
import dayjs from 'dayjs'

import { useI18n } from '../i18n/useI18n'
import { colors } from '../theme/theme'

export default function MessageBubble({ message }) {
  const { t } = useI18n()
  const isMine = message.sender_type === 'business'
  const isAi = message.sender_type === 'ai'
  const hasAttachment = Boolean(message.attachment_url)

  return (
    <View style={[styles.wrap, isMine ? styles.mineWrap : styles.theirWrap]}>
      <View style={[styles.bubble, isMine ? styles.mine : isAi ? styles.ai : styles.their]}>
        {message.content ? (
          <Text style={[styles.content, isMine ? styles.mineText : styles.theirText]}>
            {message.content}
          </Text>
        ) : null}
        {hasAttachment ? (
          <Button
            compact
            mode="outlined"
            icon="paperclip"
            onPress={() => Linking.openURL(message.attachment_url)}
            style={styles.attachment}
          >
            {message.attachment_filename || t('chat.openAttachment')}
          </Button>
        ) : null}
        <Text style={[styles.time, isMine ? styles.mineTime : styles.theirTime]}>
          {dayjs(message.created_at).format('HH:mm')}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  mineWrap: {
    alignItems: 'flex-end',
  },
  theirWrap: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  mine: {
    backgroundColor: colors.primary,
  },
  their: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ai: {
    backgroundColor: '#f8fafc',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  content: {
    lineHeight: 20,
  },
  mineText: {
    color: '#fff',
  },
  theirText: {
    color: colors.text,
  },
  time: {
    alignSelf: 'flex-end',
    fontSize: 11,
  },
  mineTime: {
    color: 'rgba(255,255,255,0.75)',
  },
  theirTime: {
    color: colors.muted,
  },
  attachment: {
    marginTop: 4,
    backgroundColor: colors.surface,
  },
})
