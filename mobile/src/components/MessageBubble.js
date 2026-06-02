import { useMemo, useState } from 'react'
import { Image, Linking, Modal, Pressable, StyleSheet, View } from 'react-native'
import { Button, IconButton, Text } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import dayjs from 'dayjs'

import { API_URL } from '../api/client'
import { useI18n } from '../i18n/useI18n'
import { useThemeStore } from '../store/themeStore'

const resolveAttachmentUrl = (url) => {
  if (!url) return ''

  try {
    const parsed = new URL(url, API_URL)
    if (parsed.pathname.startsWith('/api/files/')) {
      return `${API_URL.replace(/\/$/, '')}${parsed.pathname}${parsed.search}`
    }
    return parsed.href
  } catch {
    return url
  }
}

export default function MessageBubble({ message }) {
  const { t } = useI18n()
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [previewOpen, setPreviewOpen] = useState(false)
  const isAi = message.sender_type === 'ai'
  const isMine = message.sender_type === 'business' || isAi
  const hasAttachment = Boolean(message.attachment_url)
  const attachmentUrl = resolveAttachmentUrl(message.attachment_url)
  const fileName = message.attachment_filename || message.content || t('chat.openAttachment')
  const isImage = hasAttachment && (
    message.attachment_kind === 'image' ||
    message.attachment_mime_type?.startsWith('image/')
  )
  const showTextContent = Boolean(message.content && (!hasAttachment || message.content !== fileName))

  return (
    <View style={[styles.wrap, isMine ? styles.mineWrap : styles.theirWrap]}>
      <View style={[styles.bubble, isImage ? styles.imageBubble : isAi ? styles.ai : isMine ? styles.mine : styles.their]}>
        {isAi ? (
          <View style={styles.aiBadge}>
            <MaterialCommunityIcons name="robot-outline" size={14} color={colors.primary} />
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        ) : null}
        {showTextContent ? (
          <Text style={[styles.content, isImage ? styles.theirText : isMine ? styles.mineText : styles.theirText]}>
            {message.content}
          </Text>
        ) : null}
        {isImage ? (
          <>
            <Pressable onPress={() => setPreviewOpen(true)} style={styles.imageButton}>
              <Image source={{ uri: attachmentUrl }} style={styles.attachmentImage} resizeMode="cover" />
            </Pressable>
            <Modal visible={previewOpen} animationType="fade" transparent onRequestClose={() => setPreviewOpen(false)}>
              <Pressable style={styles.previewBackdrop} onPress={() => setPreviewOpen(false)}>
                <Image source={{ uri: attachmentUrl }} style={styles.previewImage} resizeMode="contain" />
                <IconButton
                  icon="close"
                  size={30}
                  iconColor="#fff"
                  onPress={() => setPreviewOpen(false)}
                  style={styles.previewClose}
                />
              </Pressable>
            </Modal>
          </>
        ) : hasAttachment ? (
          <Button
            compact
            mode="outlined"
            icon="paperclip"
            onPress={() => Linking.openURL(attachmentUrl)}
            style={styles.attachment}
          >
            {fileName}
          </Button>
        ) : null}
        <Text style={[styles.time, isImage ? styles.theirTime : isMine ? styles.mineTime : styles.theirTime]}>
          {dayjs(message.created_at).format('HH:mm')}
        </Text>
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
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
    backgroundColor: colors.primary,
  },
  imageBubble: {
    maxWidth: '74%',
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  aiBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#fff',
  },
  aiBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
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
  imageButton: {
    overflow: 'hidden',
    borderRadius: 8,
  },
  attachmentImage: {
    width: 220,
    height: 220,
    backgroundColor: colors.softSurface,
  },
  previewBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  previewClose: {
    position: 'absolute',
    top: 42,
    right: 18,
    zIndex: 10,
    elevation: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
})
