import { describe, it, expect } from 'vitest'
import { scaleWeights, NOTE_ORDER } from '../../src/renderer/src/audio/autotune/scale'

describe('scaleWeights', () => {
  it('chromatic allows everything', () => {
    expect(scaleWeights('C', 'chromatic')).toEqual(Array(12).fill(1))
  })

  it('C major allows exactly C D E F G A B', () => {
    const w = scaleWeights('C', 'major')
    const allowed = NOTE_ORDER.filter((_, i) => w[i] === 1)
    expect(allowed.sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'].sort())
  })

  it('A minor equals C major pitch set', () => {
    expect(scaleWeights('A', 'minor')).toEqual(scaleWeights('C', 'major'))
  })
})
