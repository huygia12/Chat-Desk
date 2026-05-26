import { useCallback } from 'react'

import { translate } from './dictionaries'
import { useLanguageStore } from '../store/languageStore'

export function useI18n() {
  const language = useLanguageStore((state) => state.language)

  const t = useCallback((key, params = {}) => translate(language, key, params), [language])

  return { language, t }
}
