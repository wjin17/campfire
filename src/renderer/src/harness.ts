import { buildChain } from './audio/engine'
import { mixGains } from './audio/mix'

async function renderImpulseThroughChain(mix: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 44100 * 3, 44100)
  const buf = ctx.createBuffer(1, 44100 * 3, 44100)
  buf.getChannelData(0)[0] = 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const chain = buildChain(ctx, src)
  const { dry, wet } = mixGains(mix)
  chain.dryGain.gain.value = dry
  chain.wetGain.gain.value = wet
  src.start()
  const rendered = await ctx.startRendering()
  return rendered.getChannelData(0)
}

declare global {
  interface Window {
    testReverbTail: () => Promise<{ early: number; tail: number }>
    testDryOnly: () => Promise<number>
  }
}

window.testReverbTail = async () => {
  const data = await renderImpulseThroughChain(0.5)
  const energy = (from: number, to: number): number => {
    let e = 0
    for (let i = from; i < to; i++) e += data[i] * data[i]
    return e
  }
  return { early: energy(0, 44100), tail: energy(44100, 88200) }
}

window.testDryOnly = async () => {
  const data = await renderImpulseThroughChain(0)
  let tail = 0
  for (let i = 4410; i < data.length; i++) tail += Math.abs(data[i])
  return tail
}
