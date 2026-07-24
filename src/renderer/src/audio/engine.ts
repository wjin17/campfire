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
}

export function buildChain(ctx: BaseAudioContext, source: AudioNode): Chain {
  const micGain = ctx.createGain()
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  const convolver = ctx.createConvolver()
  const compressor = ctx.createDynamicsCompressor()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256

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
  return { source, micGain, dryGain, wetGain, convolver, compressor, analyser }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private chain: Chain | null = null
  private autotune: AutotuneHandle | null = null
  private root: NoteName = 'C'
  private mode: Mode = 'chromatic'
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
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    const source = this.ctx.createMediaStreamSource(this.micStream)
    this.chain = buildChain(this.ctx, source)
  }

  stop(): void {
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close()
    this.autotune?.node.port.close()
    this.ctx = null
    this.chain = null
    this.micStream = null
    this.autotune = null
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

  private autotuneLoading = false

  async enableAutotune(): Promise<void> {
    if (!this.ctx || !this.chain || this.autotune || this.autotuneLoading) return
    this.autotuneLoading = true
    let handle: AutotuneHandle
    try {
      handle = await createAutotuneNode(this.ctx)
    } finally {
      this.autotuneLoading = false
    }
    if (!this.ctx || !this.chain) {
      handle.node.port.close()
      return
    }
    this.autotune = handle
    this.chain.source.disconnect(this.chain.micGain)
    this.chain.source.connect(this.autotune.node)
    this.autotune.node.connect(this.chain.micGain)
    this.applyScale()
  }

  disableAutotune(): void {
    if (!this.chain || !this.autotune) return
    this.chain.source.disconnect(this.autotune.node)
    this.autotune.node.disconnect()
    this.autotune.node.port.close()
    this.chain.source.connect(this.chain.micGain)
    this.autotune = null
  }

  setAutotuneStrength(v: number): void {
    this.autotune?.setControl(this.autotune.portMap.amount, v)
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
