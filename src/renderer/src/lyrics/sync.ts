import type { NowPlaying } from '../types/nowplaying'
import { cleanTitle } from './clean'

const EXTENSION_STALE_MS = 5000

export interface ActiveTrack {
  key: string
  title: string
  artist: string
  duration: number
}

type Source = 'extension-active' | 'extension-any' | 'smtc'

export class LyricsClock {
  private nowFn: () => number
  // Tracked separately from extensionAny so a background tab's more recent
  // message can never displace a still-fresh active-tab one — see
  // activeSource() below.
  private extensionActive: NowPlaying | null = null
  private extensionAny: NowPlaying | null = null
  private smtc: NowPlaying | null = null

  constructor(nowFn: () => number = Date.now) {
    this.nowFn = nowFn
  }

  update(msg: NowPlaying): void {
    if (msg.source === 'extension') {
      this.extensionAny = msg
      if (msg.active) this.extensionActive = msg
    } else {
      this.smtc = msg
    }
  }

  // Extension wins whenever its last message is still fresh, regardless of
  // which source's message arrived most recently — this is what gives the
  // hysteresis: a single stray smtc message can never flip activeness away
  // from a fresh extension, only a full EXTENSION_STALE_MS silence can.
  // Within "extension", an active-tab message is preferred over a
  // background-tab one whenever it is itself still fresh; only once the
  // active-tab message goes stale do we fall back to any fresh extension
  // message, and only once no extension message is fresh do we fall back
  // to smtc.
  private activeSource(): Source | null {
    const now = this.nowFn()
    if (this.extensionActive && now - this.extensionActive.ts < EXTENSION_STALE_MS) {
      return 'extension-active'
    }
    if (this.extensionAny && now - this.extensionAny.ts < EXTENSION_STALE_MS) {
      return 'extension-any'
    }
    if (this.smtc) return 'smtc'
    return null
  }

  active(): NowPlaying | null {
    const source = this.activeSource()
    if (source === 'extension-active') return this.extensionActive
    if (source === 'extension-any') return this.extensionAny
    if (source === 'smtc') return this.smtc
    return null
  }

  activeTrack(): ActiveTrack | null {
    const msg = this.active()
    if (!msg) return null
    const { title, artist } = cleanTitle(msg.title)
    const resolvedArtist = artist ?? msg.artist
    return {
      key: `${title}|${resolvedArtist}`,
      title,
      artist: resolvedArtist,
      duration: msg.duration
    }
  }

  now(leadMs: number): number {
    const msg = this.active()
    if (!msg) return 0
    const elapsed = msg.playing ? (this.nowFn() - msg.ts) / 1000 : 0
    return msg.position + elapsed + leadMs / 1000
  }
}

export function currentLineIndex(lines: { t: number; text: string }[], t: number): number {
  if (lines.length === 0 || t < lines[0].t) return -1
  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (lines[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}
