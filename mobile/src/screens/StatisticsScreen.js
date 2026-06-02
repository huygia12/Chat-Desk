import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Appbar, Button, SegmentedButtons, Surface, Text } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import dayjs from 'dayjs'

import client from '../api/client'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

const chartColors = ['#1677ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2', '#fa541c', '#2f54eb']

const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN')

const formatMinutes = (value) => {
  if (value == null) return '-'
  if (value < 60) return `${Math.round(value)}m`
  const hours = Math.floor(value / 60)
  const minutes = Math.round(value % 60)
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

export default function StatisticsScreen({ navigation }) {
  const { t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const colors = useThemeStore((state) => state.colors)
  const styles = useMemo(() => createStyles(colors), [colors])
  const [days, setDays] = useState('14')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const isBusiness = user?.role === 'business'

  const fetchStatistics = useCallback(async ({ refresh = false } = {}) => {
    if (!isBusiness) return

    setError('')
    if (refresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await client.get('/api/statistics/business', {
        params: { days: Number(days) },
      })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || t('statistics.loadError'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [days, isBusiness, t])

  useEffect(() => {
    fetchStatistics()
  }, [fetchStatistics])

  const summary = data?.summary || {}
  const aiShare = summary.total_messages
    ? `${Math.round((summary.ai_messages / summary.total_messages) * 100)}%`
    : '0%'

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="ChatDesk" subtitle={t('statistics.title')} titleStyle={styles.brandTitle} />
        {isBusiness ? <Appbar.Action icon="refresh" onPress={() => fetchStatistics({ refresh: true })} /> : null}
      </Appbar.Header>

      {!isBusiness ? (
        <View style={styles.center}>
          <Text variant="titleMedium" style={styles.permissionTitle}>{t('statistics.noPermissionTitle')}</Text>
          <Text variant="bodySmall" style={styles.permissionText}>{t('statistics.noPermissionText')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchStatistics({ refresh: true })} />}
        >
          <View style={styles.intro}>
            <Text variant="titleMedium" style={styles.pageTitle}>{t('statistics.title')}</Text>
            <Text variant="bodySmall" style={styles.subtitle}>{t('statistics.subtitle')}</Text>
          </View>

          <SegmentedButtons
            value={days}
            onValueChange={setDays}
            density="small"
            buttons={[
              { value: '7', label: t('statistics.last7Days') },
              { value: '14', label: t('statistics.last14Days') },
              { value: '30', label: t('statistics.last30Days') },
              { value: '90', label: t('statistics.last90Days') },
            ]}
          />

          {error ? (
            <Surface mode="flat" style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
            </Surface>
          ) : null}

          {loading && !data ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator />
            </View>
          ) : (
            <>
              <View style={styles.statGrid}>
                <StatCard
                  colors={colors}
                  styles={styles}
                  icon="message-text-outline"
                  title={t('statistics.totalConversations')}
                  value={formatNumber(summary.total_conversations)}
                />
                <StatCard
                  colors={colors}
                  styles={styles}
                  icon="account-group-outline"
                  title={t('statistics.totalContacts')}
                  value={formatNumber(summary.total_contacts)}
                />
                <StatCard
                  colors={colors}
                  styles={styles}
                  icon="chart-bar"
                  title={t('statistics.totalMessages')}
                  value={formatNumber(summary.total_messages)}
                />
                <StatCard
                  colors={colors}
                  styles={styles}
                  icon="robot-outline"
                  title={t('statistics.aiMessages')}
                  value={formatNumber(summary.ai_messages)}
                  suffix={aiShare}
                />
                <StatCard
                  colors={colors}
                  styles={styles}
                  icon="folder-open-outline"
                  title={t('statistics.openConversations')}
                  value={formatNumber(summary.open_conversations)}
                />
                <StatCard
                  colors={colors}
                  styles={styles}
                  icon="account-question-outline"
                  title={t('statistics.unassignedConversations')}
                  value={formatNumber(summary.unassigned_conversations)}
                />
                <StatCard
                  colors={colors}
                  styles={styles}
                  icon="timer-outline"
                  title={t('statistics.avgFirstResponse')}
                  value={formatMinutes(summary.avg_first_response_minutes)}
                />
              </View>

              <ChartPanel title={t('statistics.volumeTitle')} styles={styles}>
                <VolumeBars data={data?.volume || []} colors={colors} styles={styles} t={t} />
              </ChartPanel>

              <ChartPanel title={t('statistics.platformTitle')} styles={styles}>
                <BarList data={data?.platforms || []} colors={colors} styles={styles} />
              </ChartPanel>

              <ChartPanel title={t('statistics.assignmentTitle')} styles={styles}>
                <BarList
                  data={data?.assignments || []}
                  colors={colors}
                  styles={styles}
                  renderLabel={(item) => `${item.name} - ${t(`statistics.${item.type}`)}`}
                />
              </ChartPanel>

              <ChartPanel title={t('statistics.channelTitle')} styles={styles}>
                <BarList
                  data={data?.channels || []}
                  colors={colors}
                  styles={styles}
                  renderLabel={(item) => `${item.name} (${item.platform})`}
                />
              </ChartPanel>

              <ChartPanel title={t('statistics.senderTitle')} styles={styles}>
                <BarList data={data?.sender_types || []} colors={colors} styles={styles} />
              </ChartPanel>

              <ChartPanel title={t('statistics.labelTitle')} styles={styles}>
                <BarList
                  data={data?.top_labels || []}
                  colors={colors}
                  styles={styles}
                  renderColor={(item, index) => item.color || chartColors[index % chartColors.length]}
                />
              </ChartPanel>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function StatCard({ colors, icon, styles, suffix, title, value }) {
  return (
    <Surface mode="flat" style={styles.statCard}>
      <View style={styles.statIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.statText}>
        <View style={styles.statValueRow}>
          <Text numberOfLines={1} style={styles.statValue}>{value}</Text>
          {suffix ? <Text style={styles.statSuffix}>{suffix}</Text> : null}
        </View>
        <Text numberOfLines={2} style={styles.statTitle}>{title}</Text>
      </View>
    </Surface>
  )
}

function ChartPanel({ children, styles, title }) {
  return (
    <Surface mode="flat" style={styles.panel}>
      <Text variant="titleMedium" style={styles.panelTitle}>{title}</Text>
      {children}
    </Surface>
  )
}

function VolumeBars({ colors, data, styles, t }) {
  const maxValue = Math.max(1, ...data.map((item) => Math.max(item.conversations, item.messages)))
  if (!data.length) return <EmptyState styles={styles} />

  return (
    <View style={styles.volumeWrap}>
      <View style={styles.volumeChart}>
        {data.map((item, index) => {
          const conversationHeight = Math.max(4, (item.conversations / maxValue) * 100)
          const messageHeight = Math.max(4, (item.messages / maxValue) * 100)
          const showLabel = index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 4) === 0
          return (
            <View key={item.date} style={styles.volumeColumn}>
              <View style={styles.volumeBars}>
                <View style={[styles.messageBar, { height: messageHeight }]} />
                <View style={[styles.conversationBar, { height: conversationHeight }]} />
              </View>
              <Text numberOfLines={1} style={styles.axisLabel}>
                {showLabel ? dayjs(item.date).format('DD/MM') : ''}
              </Text>
            </View>
          )
        })}
      </View>
      <View style={styles.legendRow}>
        <Legend color={colors.primary} label={t('statistics.conversations')} styles={styles} />
        <Legend color="#91caff" label={t('statistics.messages')} styles={styles} />
      </View>
    </View>
  )
}

function BarList({ colors, data, renderColor, renderLabel, styles }) {
  const maxValue = Math.max(1, ...data.map((item) => item.count))
  if (!data.length) return <EmptyState styles={styles} />

  return (
    <View style={styles.barList}>
      {data.map((item, index) => {
        const barColor = renderColor ? renderColor(item, index) : chartColors[index % chartColors.length]
        return (
          <View key={item.id || item.key || item.name || index} style={styles.barItem}>
            <View style={styles.barLabelRow}>
              <View style={styles.barLabelWrap}>
                <View style={[styles.legendDot, { backgroundColor: barColor }]} />
                <Text numberOfLines={1} style={styles.barLabel}>
                  {renderLabel ? renderLabel(item, index) : item.name || item.label || item.key}
                </Text>
              </View>
              <Text style={styles.barValue}>{formatNumber(item.count)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(item.count / maxValue) * 100}%`, backgroundColor: barColor }]} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

function Legend({ color, label, styles }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  )
}

function EmptyState({ styles }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>No data</Text>
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
  intro: {
    gap: 4,
  },
  pageTitle: {
    color: colors.text,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 18,
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
  loadingBox: {
    padding: 48,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  statText: {
    flex: 1,
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  statSuffix: {
    color: colors.primary,
    fontWeight: '800',
  },
  statTitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  panel: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  panelTitle: {
    color: colors.text,
    fontWeight: '800',
    marginBottom: 14,
  },
  volumeWrap: {
    gap: 12,
  },
  volumeChart: {
    height: 150,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  volumeColumn: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  volumeBars: {
    height: 116,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  conversationBar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  messageBar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: '#91caff',
  },
  axisLabel: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 6,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: colors.muted,
    fontSize: 12,
  },
  barList: {
    gap: 12,
  },
  barItem: {
    gap: 6,
  },
  barLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  barLabelWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
  },
  barValue: {
    color: colors.text,
    fontWeight: '800',
  },
  barTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: colors.softSurface,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  emptyText: {
    color: colors.muted,
  },
})
