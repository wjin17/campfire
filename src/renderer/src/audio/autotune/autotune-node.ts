import { buildPortMap, defaultControls, type PortMap } from './portmap'

export interface AutotuneHandle {
  node: AudioWorkletNode
  portMap: PortMap
  setControl: (port: number, value: number) => void
}

async function loadWasmBytes(): Promise<ArrayBuffer> {
  // fetch cannot load file: URLs, so the packaged app reads the wasm via preload
  if (location.protocol === 'file:') {
    const api = (window as { api?: { wasmBytes: () => ArrayBuffer } }).api
    if (!api) throw new Error('worklet assets bridge missing')
    return api.wasmBytes()
  }
  return fetch('worklet/autotalent.wasm').then((r) => r.arrayBuffer())
}

export async function createAutotuneNode(ctx: BaseAudioContext): Promise<AutotuneHandle> {
  const bytes = await loadWasmBytes()
  const portMap = await buildPortMap(bytes.slice(0))
  await ctx.audioWorklet.addModule('worklet/autotalent-processor.js')
  const node = new AudioWorkletNode(ctx, 'autotalent', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: {
      wasmBytes: bytes,
      controls: defaultControls(portMap),
      pitchPort: portMap.detectedPitch,
      confidencePort: portMap.confidence
    }
  })
  return {
    node,
    portMap,
    setControl: (port, value) => node.port.postMessage({ type: 'set', port, value })
  }
}
