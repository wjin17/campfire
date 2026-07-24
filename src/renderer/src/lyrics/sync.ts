import type { NowPlaying } from '../types/nowplaying'

const EXTENSION_STALE_MS = 5000

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

  active(): NowPlaying | null {
    if (this.extension && this.nowFn() - this.extension.ts < EXTENSION_STALE_MS) {
      return this.extension
    }
    return this.smtc
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
