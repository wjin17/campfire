import type { NowPlaying } from '../types/nowplaying'
import { cleanTitle } from './clean'

const EXTENSION_STALE_MS = 5000

export interface ActiveTrack {
  key: string
  title: string
  artist: string
  duration: number
}

type Source = 'extension' | 'smtc'

export class LyricsClock {
  private nowFn: () => number
  private extension: NowPlaying | null = null
  private smtc: NowPlaying | null = null

  constructor(nowFn: () => number = Date.now) {
    this.nowFn = nowFn
  }

  update(msg: NowPlaying): void {
    if (msg.source === 'extension') this.extension = msg
    else this.smtc = msg
  }

  // Extension wins whenever its last message is still fresh, regardless of
  // which source's message arrived most recently — this is what gives the
  // hysteresis: a single stray smtc message can never flip activeness away
  // from a fresh extension, only a full EXTENSION_STALE_MS silence can.
  private activeSource(): Source | null {
    if (this.extension && this.nowFn() - this.extension.ts < EXTENSION_STALE_MS) {
      return 'extension'
    }
    if (this.smtc) return 'smtc'
    return null
  }

  active(): NowPlaying | null {
    const source = this.activeSource()
    if (source === 'extension') return this.extension
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
