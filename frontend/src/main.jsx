import React from 'react'
import { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import viVN from 'antd/locale/vi_VN'
import App from './App'
import { useThemeStore } from './store/themeStore'

function RootProviders() {
  const mode = useThemeStore((state) => state.mode)
  const isDark = mode === 'dark'

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.body.style.background = isDark ? '#141414' : '#fff'
  }, [isDark, mode])

  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootProviders />
  </React.StrictMode>,
)
