const SECONDS = 3.2
const PREDELAY_S = 0.02
const DECAY_POW = 2.4

export function generateHallIR(
  sampleRate: number,
  rng: () => number = Math.random
): [Float32Array, Float32Array] {
  const length = Math.floor(sampleRate * SECONDS)
  const predelay = Math.floor(sampleRate * PREDELAY_S)
  const out: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)]
  for (const ch of out) {
    let lp = 0
    for (let i = predelay; i < length; i++) {
      const t = (i - predelay) / (length - predelay)
      lp += 0.35 * (rng() * 2 - 1 - lp)
      ch[i] = lp * Math.pow(1 - t, DECAY_POW)
    }
  }
  return out
}
