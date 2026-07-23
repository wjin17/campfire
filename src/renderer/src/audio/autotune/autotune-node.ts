import { buildPortMap, defaultControls, type PortMap } from './portmap'

export interface AutotuneHandle {
  node: AudioWorkletNode
  portMap: PortMap
  setControl: (port: number, value: number) => void
}

interface WorkletAssetsApi {
  workletJs: () => string
  wasmBytes: () => ArrayBuffer
}

async function loadAssets(): Promise<{ bytes: ArrayBuffer; moduleUrl: string }> {
  // fetch cannot load file: URLs, so the packaged app reads assets via preload
  if (location.protocol === 'file:') {
    const api = (window as { api?: WorkletAssetsApi }).api
    if (!api) throw new Error('worklet assets bridge missing')
    return {
      bytes: api.wasmBytes(),
      moduleUrl: URL.createObjectURL(new Blob([api.workletJs()], { type: 'text/javascript' }))
    }
  }
  const bytes = await fetch('/worklet/autotalent.wasm').then((r) => r.arrayBuffer())
  return { bytes, moduleUrl: '/worklet/autotalent-processor.js' }
}

export async function createAutotuneNode(ctx: BaseAudioContext): Promise<AutotuneHandle> {
  const { bytes, moduleUrl } = await loadAssets()
  const portMap = await buildPortMap(bytes.slice(0))
  await ctx.audioWorklet.addModule(moduleUrl)
  const node = new AudioWorkletNode(ctx, 'autotalent', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { wasmBytes: bytes, controls: defaultControls(portMap) }
  })
  return {
    node,
    portMap,
    setControl: (port, value) => node.port.postMessage({ type: 'set', port, value })
  }
}
