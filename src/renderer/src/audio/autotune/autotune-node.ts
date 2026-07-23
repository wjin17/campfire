import { buildPortMap, defaultControls, type PortMap } from './portmap'

export interface AutotuneHandle {
  node: AudioWorkletNode
  portMap: PortMap
  setControl: (port: number, value: number) => void
}

export async function createAutotuneNode(ctx: BaseAudioContext): Promise<AutotuneHandle> {
  const bytes = await fetch('/worklet/autotalent.wasm').then((r) => r.arrayBuffer())
  const portMap = await buildPortMap(bytes.slice(0))
  await ctx.audioWorklet.addModule('/worklet/autotalent-processor.js')
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
