import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { buildPortMap, defaultControls } from '../../src/renderer/src/audio/autotune/portmap'

describe('buildPortMap on the real wasm', () => {
  it('resolves all required ports', async () => {
    const bytes = (await readFile('src/renderer/public/worklet/autotalent.wasm')).buffer
    const map = await buildPortMap(bytes as ArrayBuffer)
    expect(map.notes).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(map.detectedPitch).toBe(27)
    expect(map.confidence).toBe(28)
    expect(
      new Set([
        ...map.notes,
        map.concertA,
        map.amount,
        map.smooth,
        map.mix,
        map.detectedPitch,
        map.confidence
      ]).size
    ).toBe(18)
    const defaults = defaultControls(map)
    expect(defaults).toContainEqual([map.concertA, 440])
    expect(defaults).toContainEqual([map.mix, 1])
  })
})
