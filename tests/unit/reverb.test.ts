import { describe, it, expect } from 'vitest'
import { generateHallIR } from '../../src/renderer/src/audio/reverb'

function energy(a: Float32Array, from: number, to: number): number {
  let e = 0
  for (let i = from; i < to; i++) e += a[i] * a[i]
  return e
}

describe('generateHallIR', () => {
  const sr = 44100
  let s = 1
  const rng = () => (s = (s * 16807) % 2147483647) / 2147483647
  const [l, r] = generateHallIR(sr, rng)

  it('is 3.2s stereo', () => {
    expect(l.length).toBe(Math.floor(sr * 3.2))
    expect(r.length).toBe(l.length)
  })

  it('has 20ms of predelay silence', () => {
    const pre = Math.floor(sr * 0.02)
    expect(energy(l, 0, pre)).toBe(0)
    expect(l[pre + 100]).not.toBe(0)
  })

  it('decays over time', () => {
    const q = Math.floor(l.length / 4)
    expect(energy(l, 0, q)).toBeGreaterThan(energy(l, 3 * q, 4 * q) * 10)
  })

  it('channels are decorrelated', () => {
    expect(l[Math.floor(sr * 0.5)]).not.toBe(r[Math.floor(sr * 0.5)])
  })
})
