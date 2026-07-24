import { describe, it, expect } from 'vitest'
import { semitonesToNote } from '../../src/renderer/src/audio/tuner'

describe('semitonesToNote', () => {
  it('maps 0 to A with no deviation', () => {
    expect(semitonesToNote(0)).toEqual({ note: 'A', cents: 0 })
  })

  it('rounds small sharp deviations', () => {
    expect(semitonesToNote(0.196)).toEqual({ note: 'A', cents: 20 })
  })

  it('matches a 449Hz tone (+35 cents)', () => {
    expect(semitonesToNote(0.351)).toEqual({ note: 'A', cents: 35 })
  })

  it('rounds small flat deviations', () => {
    expect(semitonesToNote(-0.2)).toEqual({ note: 'A', cents: -20 })
  })

  it('round-half-up lands on the next note at the +/-50c boundary', () => {
    expect(semitonesToNote(3.5)).toEqual({ note: 'Db', cents: -50 })
  })

  it('wraps forward past the octave', () => {
    expect(semitonesToNote(11.6)).toEqual({ note: 'A', cents: -40 })
  })

  it('wraps backward below A', () => {
    expect(semitonesToNote(-1.3)).toEqual({ note: 'Ab', cents: -30 })
  })
})
