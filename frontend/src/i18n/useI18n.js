import { useCallback } from 'react'
import { dictionaries, defaultLanguage } from './dictionaries'
import { useLanguageStore } from '../store/languageStore'

const resolveKey = (dictionary, key) =>
  key.split('.').reduce((value, part) => value?.[part], dictionary)

export function useI18n() {
  const language = useLanguageStore((state) => state.language)
  const dictionary = dictionaries[language] || dictionaries[defaultLanguage]

  const t = useCallback((key, params = {}) => {
    const value = resolveKey(dictionary, key) ?? resolveKey(dictionaries[defaultLanguage], key) ?? key
    if (typeof value !== 'string') return key

    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
  }, [dictionary])

  return { language, t }
}
