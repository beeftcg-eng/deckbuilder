import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../pawmodoroDefaults'

/**
 * A nudge between the two players of an online practice game, over Supabase Realtime's broadcast
 * channel: when one moves, the other hears it at once and fetches the game, instead of waiting for
 * the next check. Nothing about the game travels this way (the moves themselves go through the
 * database, online.ts), so if Realtime can't be reached the game still works, just a little slower.
 * Spoken directly (Phoenix channels over a WebSocket), to need no Supabase library.
 */
export interface Nudger {
  /** Tells the other player something changed. */
  nudge: (payload?: Record<string, unknown>) => void
  close: () => void
  /** Whether the channel is joined. */
  connected: () => boolean
}

const HEARTBEAT_MS = 25_000

export function connectNudges(code: string, onNudge: (payload: Record<string, unknown>) => void): Nudger {
  let ws: WebSocket | null = null
  let joined = false
  let closed = false
  let ref = 0
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  const topic = `realtime:brewhouse-practice-${code}`
  const send = (msg: Record<string, unknown>) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...msg, ref: String(++ref) }))
  }

  const open = () => {
    if (closed || typeof WebSocket === 'undefined') return
    try {
      ws = new WebSocket(`${DEFAULT_PAWMODORO_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${DEFAULT_PAWMODORO_ANON_KEY}&vsn=1.0.0`)
    } catch {
      return
    }
    ws.onopen = () => {
      send({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false }, access_token: DEFAULT_PAWMODORO_ANON_KEY } })
      heartbeat = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {} }), HEARTBEAT_MS)
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data)) as { topic: string; event: string; payload?: { status?: string; payload?: Record<string, unknown> } }
        if (msg.topic !== topic) return
        if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') joined = true
        if (msg.event === 'broadcast' && msg.payload?.payload) onNudge(msg.payload.payload)
      } catch {
        // not one of ours
      }
    }
    ws.onclose = () => {
      joined = false
      clearInterval(heartbeat)
      if (!closed) retry = setTimeout(open, 5000)
    }
    ws.onerror = () => ws?.close()
  }
  open()

  return {
    nudge: (payload = {}) => send({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'moved', payload } }),
    close: () => {
      closed = true
      clearInterval(heartbeat)
      clearTimeout(retry)
      ws?.close()
    },
    connected: () => joined,
  }
}
