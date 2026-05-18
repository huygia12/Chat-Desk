import React from 'react'
import { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import enUS from 'antd/locale/en_US'
import viVN from 'antd/locale/vi_VN'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { useLanguageStore } from './store/languageStore'
import { useThemeStore } from './store/themeStore'
import './styles/global.css'

function RootProviders() {
  const mode = useThemeStore((state) => state.mode)
  const language = useLanguageStore((state) => state.language)
  const isDark = mode === 'dark'
  const antdLocale = language === 'vi' ? viVN : enUS

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.body.style.background = isDark ? '#141414' : '#fff'
  }, [isDark, mode])

  useEffect(() => {
    document.documentElement.lang = language === 'vi' ? 'vi' : 'en'
  }, [language])

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootProviders />
  </React.StrictMode>,
)
