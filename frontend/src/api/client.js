import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useLanguageStore } from '../store/languageStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
})

// Attach token to every request
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  const language = useLanguageStore.getState().language
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  config.headers['X-Language'] = language
  config.headers['Accept-Language'] =
    language === 'vi' ? 'vi-VN,vi;q=0.9,en;q=0.8' : 'en-US,en;q=0.9,vi;q=0.8'
  return config
})

// Handle 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default client
