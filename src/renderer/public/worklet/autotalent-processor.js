const stub = () => new Proxy({}, { get: () => () => 0 })

class AutotalentProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.ready = false
    this.failed = false
    const { wasmBytes, controls } = options.processorOptions
    this.port.onmessage = (e) => {
      if (e.data.type !== 'set') return
      if (this.ready) this.wasm.at_set_control(e.data.port, e.data.value)
      else if (!this.failed) controls.push([e.data.port, e.data.value])
    }
    const module = new WebAssembly.Module(wasmBytes)
    const instance = new WebAssembly.Instance(module, {
      env: stub(),
      wasi_snapshot_preview1: stub()
    })
    this.wasm = instance.exports
    if (this.wasm.at_init(sampleRate, 128) !== 0) {
      this.failed = true
      controls.length = 0
      return
    }
    this.inIdx = this.wasm.at_in_ptr() >> 2
    this.outIdx = this.wasm.at_out_ptr() >> 2
    for (const [p, v] of controls) this.wasm.at_set_control(p, v)
    this.ready = true
  }

  process(inputs, outputs) {
    const input = inputs[0][0]
    const outs = outputs[0]
    if (!input) return true
    if (!this.ready) {
      for (const o of outs) o.set(input)
      return true
    }
    const heap = new Float32Array(this.wasm.memory.buffer)
    heap.set(input, this.inIdx)
    this.wasm.at_process(input.length)
    const result = heap.subarray(this.outIdx, this.outIdx + input.length)
    for (const o of outs) o.set(result)
    return true
  }
}

registerProcessor('autotalent', AutotalentProcessor)
