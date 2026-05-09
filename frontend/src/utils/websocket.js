const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

let ws = null
let reconnectTimer = null

export function connectWebSocket(businessId, onMessage) {
  disconnectWebSocket()

  const url = `${WS_URL}/ws/${businessId}`
  const socket = new WebSocket(url)
  ws = socket

  // All handlers check `socket === ws` to ignore events from stale connections
  // (React StrictMode unmounts/remounts, creating a new WS and orphaning the old one)

  socket.onopen = () => {
    if (socket !== ws) return
    console.log('WebSocket connected')
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  socket.onmessage = (event) => {
    if (socket !== ws) return
    try {
      const data = JSON.parse(event.data)
      onMessage(data)
    } catch (err) {
      console.error('Failed to parse WS message:', err)
    }
  }

  socket.onclose = () => {
    if (socket !== ws) return
    console.log('WebSocket disconnected, reconnecting in 3s...')
    reconnectTimer = setTimeout(() => {
      connectWebSocket(businessId, onMessage)
    }, 3000)
  }

  socket.onerror = () => {
    // onclose always fires after onerror, so reconnect is handled there
  }

  return socket
}

export function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    const old = ws
    ws = null       // nullify BEFORE close so old handlers see socket !== ws
    old.close()
  }
}
