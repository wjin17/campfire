import { describe, it, expect } from 'vitest'
import { parseNowPlaying } from '../../src/main/nowplaying-server'

const valid = {
  source: 'extension',
  title: 'Song Title',
  artist: 'Some Artist',
  position: 12.5,
  duration: 210,
  playing: true,
  ts: 1690000000000
}

describe('parseNowPlaying', () => {
  it('accepts a valid extension message', () => {
    expect(parseNowPlaying(JSON.stringify(valid))).toEqual(valid)
  })

  it('accepts a valid smtc message', () => {
    const msg = { ...valid, source: 'smtc', artist: '' }
    expect(parseNowPlaying(JSON.stringify(msg))).toEqual(msg)
  })

  it('allows extra fields', () => {
    const msg = { ...valid, extra: 'ignored' }
    expect(parseNowPlaying(JSON.stringify(msg))).toEqual(valid)
  })

  it('rejects an unknown source', () => {
    const msg = { ...valid, source: 'spotify' }
    expect(parseNowPlaying(JSON.stringify(msg))).toBeNull()
  })

  it('rejects wrong types for position', () => {
    const msg = { ...valid, position: '12.5' }
    expect(parseNowPlaying(JSON.stringify(msg))).toBeNull()
  })

  it('rejects wrong types for playing', () => {
    const msg = { ...valid, playing: 'true' }
    expect(parseNowPlaying(JSON.stringify(msg))).toBeNull()
  })

  it('rejects missing fields', () => {
    const rest: Record<string, unknown> = { ...valid }
    delete rest.ts
    expect(parseNowPlaying(JSON.stringify(rest))).toBeNull()
  })

  it('rejects junk JSON', () => {
    expect(parseNowPlaying('not json')).toBeNull()
  })

  it('rejects a JSON array', () => {
    expect(parseNowPlaying('[1, 2, 3]')).toBeNull()
  })

  it('rejects null', () => {
    expect(parseNowPlaying('null')).toBeNull()
  })
})
