import { buildChain } from './audio/engine'
import { mixGains } from './audio/mix'
import { createAutotuneNode } from './audio/autotune/autotune-node'

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
    testAutotuneSnap: () => Promise<{ inputHz: number; outputHz: number }>
    testTunerPitch: () => Promise<{
      medianSemitones: number
      pitchCount: number
      outputHz: number
    }>
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

function estimateFreq(data: Float32Array, sampleRate: number, from: number): number {
  let crossings = 0
  let first = -1
  let last = -1
  for (let i = from + 1; i < data.length; i++) {
    if (data[i - 1] <= 0 && data[i] > 0) {
      if (first < 0) first = i
      last = i
      crossings++
    }
  }
  return ((crossings - 1) * sampleRate) / (last - first)
}

window.testAutotuneSnap = async () => {
  const sr = 44100
  const ctx = new OfflineAudioContext(1, sr * 2, sr)
  const osc = ctx.createOscillator()
  osc.frequency.value = 449
  const at = await createAutotuneNode(ctx)
  osc.connect(at.node)
  at.node.connect(ctx.destination)
  osc.start()
  const rendered = await ctx.startRendering()
  return { inputHz: 449, outputHz: estimateFreq(rendered.getChannelData(0), sr, sr) }
}

window.testTunerPitch = async () => {
  const sr = 44100
  const ctx = new OfflineAudioContext(1, sr * 2, sr)
  const osc = ctx.createOscillator()
  osc.frequency.value = 449
  const at = await createAutotuneNode(ctx)
  at.setControl(at.portMap.amount, 0)
  at.setControl(at.portMap.mix, 0)
  // give the worklet's message port a tick to apply the bypass controls —
  // an offline context can otherwise start rendering before they arrive
  await new Promise((resolve) => setTimeout(resolve, 50))
  const semitones: number[] = []
  at.node.port.onmessage = (e) => {
    if (e.data.type === 'pitch') semitones.push(e.data.semitones)
  }
  osc.connect(at.node)
  at.node.connect(ctx.destination)
  osc.start()
  const rendered = await ctx.startRendering()
  const sorted = [...semitones].sort((a, b) => a - b)
  return {
    medianSemitones: sorted[Math.floor(sorted.length / 2)],
    pitchCount: semitones.length,
    outputHz: estimateFreq(rendered.getChannelData(0), sr, sr)
  }
}
