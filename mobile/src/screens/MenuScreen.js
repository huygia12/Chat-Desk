import { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Appbar, Avatar, Switch, Surface, Text, TouchableRipple } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import BottomNavBar from '../components/BottomNavBar'
import { useI18n } from '../i18n/useI18n'
import { useAuthStore } from '../store/authStore'
import { useLanguageStore } from '../store/languageStore'
import { useThemeStore } from '../store/themeStore'

export default function MenuScreen({ navigation }) {
  const { language, t } = useI18n()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const toggleLanguage = useLanguageStore((state) => state.toggleLanguage)
  const colors = useThemeStore((state) => state.colors)
  const isDark = useThemeStore((state) => state.isDark)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const styles = useMemo(() => createStyles(colors), [colors])
  const displayName = user?.business_name || user?.full_name || user?.email || 'ChatDesk'
  const subtitle = user?.email || t('menu.accountHint')

  const navigate = (screen) => {
    navigation.navigate(screen)
  }

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content title="ChatDesk" titleStyle={styles.brandTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Surface mode="flat" style={styles.group}>
          <TouchableRipple onPress={() => navigate('AccountSettings')}>
            <View style={styles.profileRow}>
              {user?.avatar_url ? (
                <Avatar.Image
                  size={52}
                  source={{ uri: user.avatar_url }}
                  style={styles.profileAvatar}
                />
              ) : (
                <Avatar.Text
                  size={52}
                  label={String(displayName).trim().slice(0, 2).toUpperCase()}
                  style={styles.profileAvatar}
                  color={colors.primary}
                />
              )}
              <View style={styles.profileText}>
                <Text numberOfLines={1} style={styles.profileName}>{displayName}</Text>
                <Text numberOfLines={1} style={styles.profileSubtitle}>{subtitle}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={26} color={colors.muted} />
            </View>
          </TouchableRipple>
        </Surface>

        {user?.role === 'business' ? (
          <MenuGroup title={t('menu.businessTools')} styles={styles}>
            <MenuRow
              colors={colors}
              icon="link-variant"
              label={t('menu.channels')}
              onPress={() => navigate('Channels')}
              styles={styles}
            />
            <MenuRow
              colors={colors}
              icon="account-group"
              label={t('menu.employees')}
              onPress={() => navigate('Employees')}
              styles={styles}
            />
            <MenuRow
              colors={colors}
              icon="message-text-clock-outline"
              label={t('menu.savedReplies')}
              onPress={() => navigate('SavedReplies')}
              styles={styles}
            />
            <MenuRow
              colors={colors}
              icon="tag-multiple-outline"
              label={t('menu.labels')}
              onPress={() => navigate('Labels')}
              styles={styles}
            />
            <MenuRow
              colors={colors}
              icon="chart-box-outline"
              label={t('menu.statistics')}
              onPress={() => navigate('Statistics')}
              styles={styles}
            />
          </MenuGroup>
        ) : null}

        <MenuGroup title={t('menu.preferences')} styles={styles}>
          <MenuRow
            colors={colors}
            icon="translate"
            label={t('menu.language')}
            value={language === 'vi' ? 'VIE' : 'ENG'}
            onPress={toggleLanguage}
            styles={styles}
          />
          <MenuRow
            colors={colors}
            icon={isDark ? 'weather-night' : 'white-balance-sunny'}
            label={t('menu.darkMode')}
            right={<Switch value={isDark} onValueChange={toggleTheme} />}
            styles={styles}
          />
        </MenuGroup>

        <MenuGroup title={t('menu.account')} styles={styles}>
          <MenuRow
            colors={colors}
            danger
            icon="logout"
            label={t('menu.logout')}
            onPress={logout}
            styles={styles}
          />
        </MenuGroup>
      </ScrollView>
      <BottomNavBar active="Menu" navigation={navigation} />
    </View>
  )
}

function MenuGroup({ children, title, styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Surface mode="flat" style={styles.group}>
        {children}
      </Surface>
    </View>
  )
}

function MenuRow({ colors, danger = false, disabled = false, icon, label, onPress, right, styles, value }) {
  const iconColor = danger ? colors.danger : colors.text
  const content = (
    <View style={[styles.row, disabled ? styles.disabledRow : null]}>
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name={icon} size={28} color={iconColor} />
      </View>
      <Text numberOfLines={1} style={[styles.rowLabel, danger ? styles.dangerText : null]}>
        {label}
      </Text>
      {right ? (
        <View style={styles.rowRight}>
          {right}
        </View>
      ) : (
        <View style={styles.rowRight}>
          {value ? <Text numberOfLines={1} style={styles.rowValue}>{value}</Text> : null}
          {!disabled && onPress ? <MaterialCommunityIcons name="chevron-right" size={26} color={colors.muted} /> : null}
        </View>
      )}
    </View>
  )

  if (disabled || !onPress) {
    return content
  }

  return (
    <TouchableRipple onPress={onPress}>
      {content}
    </TouchableRipple>
  )
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    gap: 18,
    padding: 18,
    paddingBottom: 28,
  },
  brandTitle: {
    color: colors.primary,
    fontWeight: '800',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  group: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 86,
    paddingHorizontal: 16,
  },
  profileAvatar: {
    backgroundColor: colors.primarySoft,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '700',
  },
  profileSubtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  disabledRow: {
    opacity: 0.55,
  },
  iconBox: {
    width: 42,
    alignItems: 'flex-start',
  },
  rowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  dangerText: {
    color: colors.danger,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: 130,
  },
  rowValue: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
})
