import { generateHallIR } from './reverb'
import { mixGains } from './mix'
import { createAutotuneNode, type AutotuneHandle } from './autotune/autotune-node'
import { scaleWeights, type NoteName, type Mode } from './autotune/scale'

export interface Chain {
  source: AudioNode
  micGain: GainNode
  dryGain: GainNode
  wetGain: GainNode
  convolver: ConvolverNode
  compressor: DynamicsCompressorNode
  analyser: AnalyserNode
  micAnalyser: AnalyserNode
}

// Replaces buildChain's default source->micGain edge with
// source->worklet->micGain, so the dry signal can't bleed past the worklet
// in parallel with the corrected one.
export function wireAutotune(chain: Chain, autotune: AutotuneHandle): void {
  chain.source.disconnect(chain.micGain)
  chain.source.connect(autotune.node)
  autotune.node.connect(chain.micGain)
}

export function buildChain(ctx: BaseAudioContext, source: AudioNode): Chain {
  const micGain = ctx.createGain()
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  const convolver = ctx.createConvolver()
  const compressor = ctx.createDynamicsCompressor()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  // Tapped straight off the raw mic source (pre-gain/effects) so the level
  // meter reflects the physical mic signal, not the user's gain setting.
  const micAnalyser = ctx.createAnalyser()
  micAnalyser.fftSize = 512

  const [l, r] = generateHallIR(ctx.sampleRate)
  const ir = ctx.createBuffer(2, l.length, ctx.sampleRate)
  ir.copyToChannel(new Float32Array(l), 0)
  ir.copyToChannel(new Float32Array(r), 1)
  convolver.buffer = ir

  compressor.threshold.value = -18
  compressor.ratio.value = 3
  compressor.attack.value = 0.01
  compressor.release.value = 0.2

  source.connect(micGain)
  source.connect(micAnalyser)
  micGain.connect(dryGain)
  micGain.connect(convolver)
  convolver.connect(wetGain)
  dryGain.connect(compressor)
  wetGain.connect(compressor)
  compressor.connect(ctx.destination)
  compressor.connect(analyser)

  const { dry, wet } = mixGains(0.35)
  dryGain.gain.value = dry
  wetGain.gain.value = wet
  return { source, micGain, dryGain, wetGain, convolver, compressor, analyser, micAnalyser }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private chain: Chain | null = null
  private autotune: AutotuneHandle | null = null
  private root: NoteName = 'C'
  private mode: Mode = 'chromatic'
  private pitchCb: ((p: { semitones: number; confidence: number }) => void) | null = null
  micStream: MediaStream | null = null

  async start(deviceId?: string): Promise<void> {
    this.stop()
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    this.ctx = new AudioContext({ latencyHint: 0 })
    const source = this.ctx.createMediaStreamSource(this.micStream)
    this.chain = buildChain(this.ctx, source)
    try {
      this.autotune = await createAutotuneNode(this.ctx)
      wireAutotune(this.chain, this.autotune)
      this.applyScale()
      this.setAutotuneEnabled(false)
      this.wirePitch()
    } catch {
      this.autotune = null
    }
  }

  stop(): void {
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close()
    this.autotune?.node.port.close()
    this.ctx = null
    this.chain = null
    this.micStream = null
    this.autotune = null
    this.pitchCb = null
  }

  get autotuneAvailable(): boolean {
    return this.autotune !== null
  }

  setMicGain(v: number): void {
    if (this.chain) this.chain.micGain.gain.value = v
  }

  setReverbMix(v: number): void {
    if (!this.chain) return
    const { dry, wet } = mixGains(v)
    this.chain.dryGain.gain.value = dry
    this.chain.wetGain.gain.value = wet
  }

  getAnalyser(): AnalyserNode | null {
    return this.chain?.analyser ?? null
  }

  getMicAnalyser(): AnalyserNode | null {
    return this.chain?.micAnalyser ?? null
  }

  setAutotuneEnabled(enabled: boolean, strength = 1): void {
    if (!this.autotune) return
    this.autotune.setControl(this.autotune.portMap.amount, enabled ? strength : 0)
    this.autotune.setControl(this.autotune.portMap.mix, enabled ? 1 : 0)
  }

  setAutotuneStrength(v: number): void {
    this.autotune?.setControl(this.autotune.portMap.amount, v)
  }

  onPitch(cb: ((p: { semitones: number; confidence: number }) => void) | null): void {
    this.pitchCb = cb
    this.wirePitch()
  }

  private wirePitch(): void {
    if (!this.autotune) return
    const cb = this.pitchCb
    this.autotune.node.port.onmessage = cb
      ? (e: MessageEvent): void => {
          if (e.data.type === 'pitch') {
            cb({ semitones: e.data.semitones, confidence: e.data.confidence })
          }
        }
      : null
  }

  setAutotuneScale(root: NoteName, mode: Mode): void {
    this.root = root
    this.mode = mode
    this.applyScale()
  }

  private applyScale(): void {
    if (!this.autotune) return
    const weights = scaleWeights(this.root, this.mode)
    weights.forEach((w, i) => this.autotune!.setControl(this.autotune!.portMap.notes[i], w))
  }
}
