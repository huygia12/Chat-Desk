import { Button } from 'react-native-paper'

import { useI18n } from '../i18n/useI18n'
import { useLanguageStore } from '../store/languageStore'

export default function LanguageToggle({ compact = false }) {
  const { t } = useI18n()
  const toggleLanguage = useLanguageStore((state) => state.toggleLanguage)

  return (
    <Button
      compact={compact}
      icon="translate"
      mode="text"
      accessibilityLabel={t('language.toggleLabel')}
      onPress={toggleLanguage}
    >
      {t('language.toggle')}
    </Button>
  )
}
