import { WS_URL } from '../api/client'

let socket = null
let reconnectTimer = null

export function connectChatSocket(token, onMessage) {
  disconnectChatSocket()
  if (!token) return null

  const ws = new WebSocket(`${WS_URL}/ws/me?token=${encodeURIComponent(token)}`)
  socket = ws

  ws.onopen = () => {
    if (ws !== socket) return
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onmessage = (event) => {
    if (ws !== socket) return
    try {
      onMessage(JSON.parse(event.data))
    } catch (error) {
      console.warn('Invalid websocket payload:', error)
    }
  }

  ws.onclose = () => {
    if (ws !== socket) return
    reconnectTimer = setTimeout(() => connectChatSocket(token, onMessage), 3000)
  }

  ws.onerror = () => {
    // React Native fires onclose after socket errors; reconnect is handled there.
  }

  return ws
}

export function disconnectChatSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    const previous = socket
    socket = null
    previous.close()
  }
}
