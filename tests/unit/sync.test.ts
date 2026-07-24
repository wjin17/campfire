import { describe, it, expect } from 'vitest'
import { LyricsClock, currentLineIndex } from '../../src/renderer/src/lyrics/sync'
import type { NowPlaying } from '../../src/renderer/src/types/nowplaying'

function msg(partial: Partial<NowPlaying>): NowPlaying {
  return {
    source: 'extension',
    title: 'Song',
    artist: 'Artist',
    position: 0,
    duration: 200,
    playing: true,
    ts: 0,
    ...partial
  }
}

describe('LyricsClock', () => {
  it('returns 0 before any message arrives', () => {
    const clock = new LyricsClock(() => 0)
    expect(clock.now(0)).toBe(0)
  })

  it('advances position by elapsed fake time while playing', () => {
    let t = 1000
    const clock = new LyricsClock(() => t)
    clock.update(msg({ position: 10, ts: 1000, playing: true }))
    t = 3000
    expect(clock.now(0)).toBe(12)
  })

  it('does not advance while paused', () => {
    let t = 1000
    const clock = new LyricsClock(() => t)
    clock.update(msg({ position: 10, ts: 1000, playing: false }))
    t = 3000
    expect(clock.now(0)).toBe(10)
  })

  it('applies leadMs as seconds', () => {
    const clock = new LyricsClock(() => 1000)
    clock.update(msg({ position: 10, ts: 1000, playing: false }))
    expect(clock.now(500)).toBe(10.5)
    expect(clock.now(-500)).toBe(9.5)
  })

  it('prefers a fresh extension message over smtc', () => {
    const t = 1000
    const clock = new LyricsClock(() => t)
    clock.update(msg({ source: 'smtc', position: 50, ts: 900, playing: false }))
    clock.update(msg({ source: 'extension', position: 10, ts: 1000, playing: false }))
    expect(clock.now(0)).toBe(10)
  })

  it('falls back to smtc once the extension message goes stale (>5s)', () => {
    let t = 0
    const clock = new LyricsClock(() => t)
    clock.update(msg({ source: 'extension', position: 10, ts: 0, playing: false }))
    clock.update(msg({ source: 'smtc', position: 50, ts: 0, playing: false }))
    t = 5001
    expect(clock.now(0)).toBe(50)
  })

  it('keeps using extension while it is within the 5s staleness window', () => {
    let t = 0
    const clock = new LyricsClock(() => t)
    clock.update(msg({ source: 'extension', position: 10, ts: 0, playing: false }))
    clock.update(msg({ source: 'smtc', position: 50, ts: 0, playing: false }))
    t = 4999
    expect(clock.now(0)).toBe(10)
  })
})

describe('currentLineIndex', () => {
  const lines = [
    { t: 0, text: 'a' },
    { t: 10, text: 'b' },
    { t: 20, text: 'c' }
  ]

  it('returns -1 for an empty line list', () => {
    expect(currentLineIndex([], 5)).toBe(-1)
  })

  it('returns -1 before the first line', () => {
    expect(currentLineIndex(lines, -1)).toBe(-1)
  })

  it('returns the exact index on a boundary hit', () => {
    expect(currentLineIndex(lines, 10)).toBe(1)
  })

  it('returns the previous line between two timestamps', () => {
    expect(currentLineIndex(lines, 15)).toBe(1)
  })

  it('returns the last line once past the final timestamp', () => {
    expect(currentLineIndex(lines, 999)).toBe(2)
  })
})
