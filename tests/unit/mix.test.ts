import { describe, it, expect } from 'vitest'
import { mixGains } from '../../src/renderer/src/audio/mix'

describe('mixGains', () => {
  it('is dry-only at 0 and wet-only at 1', () => {
    expect(mixGains(0)).toEqual({ dry: 1, wet: 0 })
    expect(mixGains(1).dry).toBeCloseTo(0)
    expect(mixGains(1).wet).toBeCloseTo(1)
  })

  it('is equal-power at midpoint', () => {
    const { dry, wet } = mixGains(0.5)
    expect(dry * dry + wet * wet).toBeCloseTo(1)
    expect(dry).toBeCloseTo(wet)
  })
})
