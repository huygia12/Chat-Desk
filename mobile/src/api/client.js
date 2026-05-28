import axios from 'axios'

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'
export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ||
  API_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')

let accessToken = null
let requestLanguage = 'vi'

export function setAccessToken(token) {
  accessToken = token
}

export function setClientLanguage(language) {
  requestLanguage = language === 'en' ? 'en' : 'vi'
}

function getLanguageHeaders() {
  return {
    'X-Language': requestLanguage,
    'Accept-Language':
      requestLanguage === 'vi' ? 'vi-VN,vi;q=0.9,en;q=0.8' : 'en-US,en;q=0.9,vi;q=0.8',
  }
}

const client = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
    ...getLanguageHeaders(),
  },
})

client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  Object.assign(config.headers, getLanguageHeaders())
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

export default client
