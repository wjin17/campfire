export interface PortMap {
  notes: number[]
  concertA: number
  amount: number
  smooth: number
  mix: number
  detectedPitch: number
  confidence: number
}

interface AutotalentExports {
  memory: WebAssembly.Memory
  at_init: (sampleRate: number, maxBlock: number) => number
  at_port_count: () => number
  at_port_is_control_input: (p: number) => number
  at_port_lower: (p: number) => number
  at_port_upper: (p: number) => number
  at_port_name: (p: number) => number
}

const stub = (): Record<string, () => number> =>
  new Proxy({}, { get: () => () => 0 }) as Record<string, () => number>

export async function buildPortMap(bytes: ArrayBuffer): Promise<PortMap> {
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: stub(),
    wasi_snapshot_preview1: stub()
  })
  const w = instance.exports as unknown as AutotalentExports
  if (w.at_init(44100, 128) !== 0) throw new Error('autotalent init failed')

  const name = (ptr: number): string => {
    const mem = new Uint8Array(w.memory.buffer)
    let end = ptr
    while (mem[end] !== 0) end++
    return new TextDecoder().decode(mem.subarray(ptr, end)).toLowerCase()
  }

  const n = w.at_port_count()
  const notes: number[] = []
  let concertA = -1
  let amount = -1
  let smooth = -1
  let mix = -1
  let detectedPitch = -1
  let confidence = -1

  for (let p = 0; p < n; p++) {
    if (!w.at_port_is_control_input(p)) {
      const nm = name(w.at_port_name(p))
      if (nm.includes('detected pitch')) detectedPitch = p
      else if (nm.includes('confidence')) confidence = p
      if (notes.length > 0 && notes.length < 12) notes.length = 0
      continue
    }
    const isNoteRange =
      Math.abs(w.at_port_lower(p) + 1.1) < 0.01 && Math.abs(w.at_port_upper(p) - 1.1) < 0.01
    const nm = name(w.at_port_name(p))
    if (isNoteRange && notes.length < 12 && !nm.includes('pull')) {
      notes.push(p)
      continue
    }
    if (notes.length > 0 && notes.length < 12) notes.length = 0
    if (nm.includes('concert')) concertA = p
    else if (nm.includes('strength') || nm.includes('amount')) amount = p
    else if (nm.includes('smooth')) smooth = p
    else if (nm.includes('mix')) mix = p
  }

  if (
    notes.length !== 12 ||
    concertA < 0 ||
    amount < 0 ||
    smooth < 0 ||
    mix < 0 ||
    detectedPitch < 0 ||
    confidence < 0
  ) {
    throw new Error('autotalent port map incomplete — compare with scripts/dump-ports.mjs output')
  }
  return { notes, concertA, amount, smooth, mix, detectedPitch, confidence }
}

export function defaultControls(map: PortMap): Array<[number, number]> {
  return [
    [map.concertA, 440],
    [map.amount, 1],
    [map.smooth, 0],
    [map.mix, 1],
    ...map.notes.map((p): [number, number] => [p, 1])
  ]
}
