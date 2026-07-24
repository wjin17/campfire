import { WebSocketServer } from 'ws'
import type { BrowserWindow } from 'electron'

export interface NowPlaying {
  source: 'extension' | 'smtc'
  title: string
  artist: string
  position: number
  duration: number
  playing: boolean
  ts: number
}

export function parseNowPlaying(raw: string): NowPlaying | null {
  let msg: unknown
  try {
    msg = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof msg !== 'object' || msg === null) return null
  const m = msg as Record<string, unknown>
  if (m.source !== 'extension' && m.source !== 'smtc') return null
  if (typeof m.title !== 'string') return null
  if (typeof m.artist !== 'string') return null
  if (typeof m.position !== 'number') return null
  if (typeof m.duration !== 'number') return null
  if (typeof m.playing !== 'boolean') return null
  if (typeof m.ts !== 'number') return null
  return {
    source: m.source,
    title: m.title,
    artist: m.artist,
    position: m.position,
    duration: m.duration,
    playing: m.playing,
    ts: m.ts
  }
}

function wireConnections(wss: WebSocketServer, win: BrowserWindow): void {
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const parsed = parseNowPlaying(data.toString())
      if (parsed) win.webContents.send('now-playing', parsed)
    })
  })
}

export function startNowPlayingServer(
  win: BrowserWindow,
  preferredPort: number,
  fallbackPort: number
): Promise<{ server: WebSocketServer; port: number }> {
  return new Promise((resolve, reject) => {
    const primary = new WebSocketServer({ host: '127.0.0.1', port: preferredPort })
    const onListening = (): void => {
      wireConnections(primary, win)
      resolve({ server: primary, port: preferredPort })
    }
    primary.once('listening', onListening)
    primary.once('error', () => {
      primary.removeListener('listening', onListening)
      const fallback = new WebSocketServer({ host: '127.0.0.1', port: fallbackPort })
      fallback.once('listening', () => {
        wireConnections(fallback, win)
        resolve({ server: fallback, port: fallbackPort })
      })
      fallback.once('error', reject)
    })
  })
}
