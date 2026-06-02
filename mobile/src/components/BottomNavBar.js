import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, TouchableRipple } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import { useI18n } from '../i18n/useI18n'
import { useThemeStore } from '../store/themeStore'

const items = [
  { key: 'Conversations', labelKey: 'tabs.chats', icon: 'message-text-outline', activeIcon: 'message-text' },
  { key: 'Products', labelKey: 'tabs.products', icon: 'package-variant', activeIcon: 'package-variant-closed' },
  { key: 'Assignments', labelKey: 'tabs.assignments', icon: 'account-switch-outline', activeIcon: 'account-switch' },
  { key: 'Menu', labelKey: 'tabs.menu', icon: 'menu', activeIcon: 'menu' },
]

export default function BottomNavBar({ active, navigation }) {
  const { t } = useI18n()
  const colors = useThemeStore((state) => state.colors)
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom])

  const handlePress = (item) => {
    if (item.disabled || item.key === active) return
    navigation.navigate(item.key)
  }

  return (
    <View style={styles.container}>
      {items.map((item) => {
        const selected = item.key === active
        const iconColor = item.disabled ? colors.muted : selected ? colors.primary : colors.muted
        const textStyle = [
          styles.label,
          item.disabled ? styles.disabledLabel : selected ? styles.activeLabel : null,
        ]

        return (
          <TouchableRipple
            key={item.key}
            borderless
            disabled={item.disabled}
            onPress={() => handlePress(item)}
            style={[styles.item, item.disabled ? styles.disabledItem : null]}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: item.disabled }}
          >
            <View style={styles.itemInner}>
              <MaterialCommunityIcons
                name={selected ? item.activeIcon || item.icon : item.icon}
                size={24}
                color={iconColor}
              />
              <Text numberOfLines={1} style={textStyle}>
                {t(item.labelKey)}
              </Text>
            </View>
          </TouchableRipple>
        )
      })}
    </View>
  )
}

const createStyles = (colors, bottomInset) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: 64 + bottomInset,
    paddingTop: 6,
    paddingBottom: Math.max(bottomInset, 6),
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    minWidth: 0,
  },
  itemInner: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  activeLabel: {
    color: colors.primary,
  },
  disabledItem: {
    opacity: 0.5,
  },
  disabledLabel: {
    color: colors.muted,
  },
})
