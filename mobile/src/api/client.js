import axios from 'axios'

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'
export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ||
  API_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')

let accessToken = null

export function setAccessToken(token) {
  accessToken = token
}

const client = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
    'X-Language': 'vi',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  },
})

client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

export default client
