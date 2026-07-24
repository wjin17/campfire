import { describe, it, expect } from 'vitest'
import { matchScore, pickBestMatch, type LrclibTrack } from '../../src/renderer/src/lyrics/lrclib'

describe('matchScore', () => {
  it('scores identical strings as 1', () => {
    expect(matchScore('Someone Like You Adele', 'Someone Like You Adele')).toBe(1)
  })

  it('is case- and punctuation-insensitive', () => {
    expect(matchScore('Someone Like You', 'someone, LIKE you!')).toBe(1)
  })

  it('scores completely disjoint strings as 0', () => {
    expect(matchScore('Song One Artist', 'Totally Different Track')).toBe(0)
  })

  it('scores partial word overlap between 0 and 1', () => {
    const score = matchScore('Song Title Some Artist', 'Song Title Other Artist')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('treats two empty strings as a perfect match', () => {
    expect(matchScore('', '')).toBe(1)
  })

  it('treats one empty string as no match', () => {
    expect(matchScore('Song', '')).toBe(0)
  })
})

describe('pickBestMatch', () => {
  const fixture: LrclibTrack[] = [
    {
      trackName: 'Someone Like You',
      artistName: 'Adele',
      duration: 285,
      syncedLyrics: '[00:00.00]lyrics a'
    },
    {
      trackName: 'Some Completely Different Track',
      artistName: 'Nobody',
      duration: 200,
      syncedLyrics: '[00:00.00]lyrics b'
    },
    {
      trackName: 'Someone Like You (Live)',
      artistName: 'Adele',
      duration: 300,
      syncedLyrics: null
    }
  ]

  it('picks the closest title+artist match', () => {
    const best = pickBestMatch(fixture, 'Someone Like You', 'Adele')
    expect(best?.trackName).toBe('Someone Like You')
  })

  it('never returns a result with no synced lyrics', () => {
    const results: LrclibTrack[] = [
      { trackName: 'Someone Like You', artistName: 'Adele', duration: 285, syncedLyrics: null }
    ]
    expect(pickBestMatch(results, 'Someone Like You', 'Adele')).toBeNull()
  })

  it('returns null for an empty result set', () => {
    expect(pickBestMatch([], 'Someone Like You', 'Adele')).toBeNull()
  })

  it('uses duration proximity to break a tie between equally-worded titles', () => {
    const tied: LrclibTrack[] = [
      { trackName: 'Song', artistName: 'Artist', duration: 100, syncedLyrics: '[00:00.00]x' },
      { trackName: 'Song', artistName: 'Artist', duration: 200, syncedLyrics: '[00:00.00]y' }
    ]
    const best = pickBestMatch(tied, 'Song', 'Artist', 201)
    expect(best?.duration).toBe(200)
  })
})
