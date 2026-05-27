import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import {
  ActivityIndicator,
  Appbar,
  Button,
  Dialog,
  IconButton,
  Portal,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper'
import dayjs from 'dayjs'

import client from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

const platformMeta = {
  facebook: {
    label: 'Facebook',
    icon: 'facebook',
    color: '#1877f2',
  },
  instagram: {
    label: 'Instagram',
    icon: 'instagram',
    color: '#c13584',
  },
  telegram: {
    label: 'Telegram',
    icon: 'send',
    color: '#229ed9',
  },
}

export default function ChannelsScreen({ navigation }) {
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState(null)
  const [channelToDisconnect, setChannelToDisconnect] = useState(null)
  const [error, setError] = useState('')

  const isBusiness = user?.role === 'business'

  const fetchChannels = useCallback(async ({ refresh = false } = {}) => {
    if (!isBusiness) return
    setError('')
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const res = await client.get('/api/channels')
      setChannels(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Khong the tai danh sach kenh ket noi.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isBusiness])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const connectMeta = async () => {
    setMetaLoading(true)
    setError('')
    try {
      const res = await client.get('/api/channels/facebook/oauth')
      await Linking.openURL(res.data.url)
    } catch (err) {
      setError(err.response?.data?.detail || 'Khong the mo luong ket noi Meta.')
    } finally {
      setMetaLoading(false)
    }
  }

  const connectTelegram = async () => {
    const token = telegramToken.trim()
    if (!token) {
      setError('Vui long nhap Bot Token.')
      return
    }

    setTelegramLoading(true)
    setError('')
    try {
      await client.post('/api/channels/telegram/connect', { access_token: token })
      setTelegramToken('')
      setTelegramDialogOpen(false)
      await fetchChannels({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Ket noi Telegram that bai.')
    } finally {
      setTelegramLoading(false)
    }
  }

  const disconnectChannel = async () => {
    if (!channelToDisconnect?.id) return

    setDisconnectingId(channelToDisconnect.id)
    setError('')
    try {
      await client.delete(`/api/channels/${channelToDisconnect.id}`)
      setChannelToDisconnect(null)
      await fetchChannels({ refresh: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Ngat ket noi that bai.')
    } finally {
      setDisconnectingId(null)
    }
  }

  const renderChannel = (channel) => {
    const meta = platformMeta[channel.platform] || {
      label: channel.platform || 'Unknown',
      icon: 'link-variant',
      color: colors.primary,
    }

    return (
      <Surface key={String(channel.id)} mode="flat" style={styles.card}>
        <View style={styles.channelHeader}>
          <View style={styles.platformBadge}>
            <IconButton
              icon={meta.icon}
              size={20}
              iconColor="#fff"
              style={[styles.platformIcon, { backgroundColor: meta.color }]}
            />
            <View style={styles.channelTitle}>
              <Text variant="titleMedium" numberOfLines={1} style={styles.channelName}>
                {channel.page_name || meta.label}
              </Text>
              <Text variant="bodySmall" style={styles.platformText}>
                {meta.label}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, channel.is_active ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, channel.is_active ? styles.statusActiveText : styles.statusInactiveText]}>
              {channel.is_active ? 'Hoat dong' : 'Da tat'}
            </Text>
          </View>
        </View>

        <View style={styles.metaRows}>
          <View style={styles.metaRow}>
            <Text variant="labelSmall" style={styles.metaLabel}>Platform ID</Text>
            <Text variant="bodySmall" numberOfLines={1} style={styles.metaValue}>
              {channel.platform_page_id || '-'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text variant="labelSmall" style={styles.metaLabel}>Ket noi luc</Text>
            <Text variant="bodySmall" style={styles.metaValue}>
              {channel.created_at ? dayjs(channel.created_at).format('DD/MM/YYYY HH:mm') : '-'}
            </Text>
          </View>
        </View>

        <Button
          mode="outlined"
          textColor={colors.danger}
          icon="link-off"
          loading={disconnectingId === channel.id}
          disabled={Boolean(disconnectingId)}
          onPress={() => setChannelToDisconnect(channel)}
          style={styles.disconnectButton}
        >
          Ngat ket noi
        </Button>
      </Surface>
    )
  }

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Kenh ket noi" subtitle={isBusiness ? user?.business_name || user?.email : user?.email} />
        {isBusiness ? <Appbar.Action icon="refresh" onPress={() => fetchChannels({ refresh: true })} /> : null}
      </Appbar.Header>

      {!isBusiness ? (
        <View style={styles.center}>
          <Text variant="titleMedium" style={styles.permissionTitle}>Khong co quyen quan ly kenh</Text>
          <Text variant="bodySmall" style={styles.permissionText}>
            Man hinh nay chi danh cho tai khoan doanh nghiep.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchChannels({ refresh: true })} />
            }
          >
            <Surface mode="flat" style={styles.connectPanel}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Them kenh ket noi</Text>
              <Text variant="bodySmall" style={styles.helper}>
                Ket noi Meta de nhan tin Facebook/Instagram, hoac Telegram Bot de nhan tin Telegram.
              </Text>
              <View style={styles.actions}>
                <Button
                  mode="contained"
                  icon="facebook"
                  loading={metaLoading}
                  disabled={metaLoading}
                  onPress={connectMeta}
                  style={styles.actionButton}
                >
                  Ket noi Meta
                </Button>
                <Button
                  mode="outlined"
                  icon="send"
                  onPress={() => setTelegramDialogOpen(true)}
                  style={styles.actionButton}
                >
                  Telegram
                </Button>
              </View>
            </Surface>

            {error ? (
              <Surface mode="flat" style={styles.errorBox}>
                <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
              </Surface>
            ) : null}

            <View style={styles.listHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Danh sach kenh</Text>
              <Text variant="bodySmall" style={styles.countText}>{channels.length} kenh</Text>
            </View>

            {loading ? (
              <ActivityIndicator style={styles.loading} />
            ) : channels.length === 0 ? (
              <Surface mode="flat" style={styles.empty}>
                <Text variant="titleMedium">Chua co kenh ket noi</Text>
                <Text variant="bodySmall" style={styles.emptyText}>
                  Kenh da ket noi se xuat hien tai day.
                </Text>
              </Surface>
            ) : (
              channels.map(renderChannel)
            )}
          </ScrollView>

          <Portal>
            <Dialog
              visible={telegramDialogOpen}
              onDismiss={() => {
                setTelegramDialogOpen(false)
                setTelegramToken('')
              }}
            >
              <Dialog.Title>Ket noi Telegram Bot</Dialog.Title>
              <Dialog.Content>
                <Text variant="bodySmall" style={styles.dialogHelper}>
                  Tao bot voi @BotFather, copy Bot Token va dan vao ben duoi.
                </Text>
                <TextInput
                  mode="outlined"
                  label="Bot Token"
                  value={telegramToken}
                  onChangeText={setTelegramToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setTelegramDialogOpen(false)}>Huy</Button>
                <Button loading={telegramLoading} disabled={telegramLoading} onPress={connectTelegram}>
                  Ket noi
                </Button>
              </Dialog.Actions>
            </Dialog>

            <Dialog visible={Boolean(channelToDisconnect)} onDismiss={() => setChannelToDisconnect(null)}>
              <Dialog.Title>Ngat ket noi kenh?</Dialog.Title>
              <Dialog.Content>
                <Text>
                  Kenh {channelToDisconnect?.page_name || channelToDisconnect?.platform} se khong nhan tin nhan moi.
                </Text>
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setChannelToDisconnect(null)}>Huy</Button>
                <Button
                  textColor={colors.danger}
                  loading={disconnectingId === channelToDisconnect?.id}
                  disabled={Boolean(disconnectingId)}
                  onPress={disconnectChannel}
                >
                  Ngat ket noi
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </>
      )}
    </View>
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
    padding: 24,
  },
  permissionTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  permissionText: {
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 28,
  },
  connectPanel: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  helper: {
    color: colors.muted,
    marginTop: 6,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
  },
  errorBox: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.errorBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.errorBorder,
  },
  errorText: {
    color: colors.danger,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  countText: {
    color: colors.muted,
  },
  loading: {
    marginVertical: 20,
  },
  empty: {
    alignItems: 'center',
    borderRadius: 8,
    padding: 24,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.muted,
    marginTop: 4,
  },
  card: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  platformBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  platformIcon: {
    margin: 0,
  },
  channelTitle: {
    flex: 1,
    minWidth: 0,
  },
  channelName: {
    color: colors.text,
    fontWeight: '700',
  },
  platformText: {
    color: colors.muted,
    marginTop: 1,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusActive: {
    backgroundColor: colors.successBg,
  },
  statusInactive: {
    backgroundColor: colors.dangerBg,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusActiveText: {
    color: colors.success,
  },
  statusInactiveText: {
    color: colors.danger,
  },
  metaRows: {
    gap: 8,
    marginTop: 14,
  },
  metaRow: {
    gap: 2,
  },
  metaLabel: {
    color: colors.muted,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: colors.text,
  },
  disconnectButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    marginTop: 14,
    borderColor: colors.errorBorder,
  },
  dialogHelper: {
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 18,
  },
})
