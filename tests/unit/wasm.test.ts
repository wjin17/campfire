import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'

interface AutotalentExports {
  memory: WebAssembly.Memory
  at_init: (sampleRate: number, maxBlock: number) => number
  at_port_count: () => number
  at_port_is_control_input: (p: number) => number
  at_port_lower: (p: number) => number
  at_port_upper: (p: number) => number
  at_in_ptr: () => number
  at_out_ptr: () => number
  at_process: (n: number) => void
  at_set_control: (p: number, v: number) => void
  at_get_control: (p: number) => number
}

let w: AutotalentExports

beforeAll(async () => {
  const stub = (): object => new Proxy({}, { get: () => () => 0 })
  const bytes = await readFile('src/renderer/public/worklet/autotalent.wasm')
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: stub(),
    wasi_snapshot_preview1: stub()
  })
  w = instance.exports as unknown as AutotalentExports
})

describe('autotalent wasm', () => {
  it('initializes', () => {
    expect(w.at_init(44100, 128)).toBe(0)
  })

  it('has a plausible port table', () => {
    const n = w.at_port_count()
    expect(n).toBeGreaterThan(20)
    let noteLike = 0
    for (let p = 0; p < n; p++) {
      if (
        w.at_port_is_control_input(p) &&
        Math.abs(w.at_port_lower(p) - -1.1) < 0.001 &&
        Math.abs(w.at_port_upper(p) - 1.1) < 0.001
      ) {
        noteLike++
      }
    }
    expect(noteLike).toBeGreaterThanOrEqual(12)
  })

  it('processes a block without trapping', () => {
    const f32 = new Float32Array(w.memory.buffer)
    const inIdx = w.at_in_ptr() >> 2
    for (let i = 0; i < 128; i++) f32[inIdx + i] = Math.sin((2 * Math.PI * 440 * i) / 44100)
    w.at_process(128)
    expect(Number.isFinite(new Float32Array(w.memory.buffer)[w.at_out_ptr() >> 2])).toBe(true)
  })

  it('exposes the detected pitch and confidence output ports via at_get_control', () => {
    w.at_set_control(0, 440) // concert A, required for pitch-to-semitone conversion
    const f32 = new Float32Array(w.memory.buffer)
    const inIdx = w.at_in_ptr() >> 2
    for (let block = 0; block < 40; block++) {
      for (let i = 0; i < 128; i++) {
        f32[inIdx + i] = Math.sin((2 * Math.PI * 449 * (block * 128 + i)) / 44100)
      }
      w.at_process(128)
    }
    expect(w.at_get_control(28)).toBeGreaterThan(0.9)
    expect(Math.abs(w.at_get_control(27) - 0.351)).toBeLessThan(0.1)
  })
})
