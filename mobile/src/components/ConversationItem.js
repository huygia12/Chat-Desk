import { Image, StyleSheet, View } from 'react-native'
import { Avatar, Badge, Text, TouchableRipple } from 'react-native-paper'
import dayjs from 'dayjs'

import { useI18n } from '../i18n/useI18n'
import { colors } from '../theme/theme'

const platformColors = {
  facebook: '#1877f2',
  instagram: '#c13584',
  telegram: '#229ed9',
  widget: '#1677ff',
}

export default function ConversationItem({ conversation, onPress }) {
  const { t } = useI18n()
  const contact = conversation.contact || {}
  const displayName = contact.display_name || contact.visitor_email || `${t('conversations.guest')} ${String(contact.platform_user_id || '').slice(-6)}`
  const platform = conversation.platform || contact.platform
  const label = platform ? platform[0]?.toUpperCase() : '?'
  const unreadCount = Number(conversation.unread_count || 0)

  return (
    <TouchableRipple onPress={onPress} rippleColor="rgba(22, 119, 255, 0.08)">
      <View style={styles.container}>
        {contact.profile_pic_url ? (
          <Image source={{ uri: contact.profile_pic_url }} style={styles.avatarImage} />
        ) : (
          <Avatar.Text
            size={44}
            label={label}
            color="#fff"
            style={[styles.avatar, { backgroundColor: platformColors[platform] || colors.primary }]}
          />
        )}
        <View style={styles.content}>
          <View style={styles.row}>
            <Text numberOfLines={1} variant="titleMedium" style={styles.name}>
              {displayName}
            </Text>
            <Text variant="labelSmall" style={styles.time}>
              {conversation.last_message_at ? dayjs(conversation.last_message_at).format('HH:mm') : ''}
            </Text>
          </View>
          <View style={styles.row}>
            <Text numberOfLines={1} variant="bodySmall" style={styles.meta}>
              {platform || t('conversations.unknownPlatform')}{conversation.assigned_to?.full_name ? ` - ${conversation.assigned_to.full_name}` : ''}
            </Text>
            {unreadCount > 0 ? (
              <Badge size={22} style={styles.unread}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            ) : null}
            {conversation.is_ai_enabled ? <Text style={styles.ai}>AI</Text> : null}
          </View>
        </View>
      </View>
    </TouchableRipple>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    marginTop: 2,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginTop: 2,
    backgroundColor: colors.primarySoft,
  },
  content: {
    flex: 1,
    gap: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
  },
  time: {
    color: colors.muted,
  },
  meta: {
    flex: 1,
    color: colors.muted,
  },
  ai: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  unread: {
    backgroundColor: colors.danger,
    color: '#fff',
    fontWeight: '700',
  },
})
