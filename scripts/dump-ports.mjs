import { readFile } from 'node:fs/promises'

const stub = () => new Proxy({}, { get: () => () => 0 })
const bytes = await readFile('src/renderer/public/worklet/autotalent.wasm')
const { instance } = await WebAssembly.instantiate(bytes, {
  env: stub(),
  wasi_snapshot_preview1: stub()
})
const w = instance.exports
if (w.at_init(44100, 128) !== 0) throw new Error('at_init failed')

const str = (ptr) => {
  const mem = new Uint8Array(w.memory.buffer)
  let end = ptr
  while (mem[end] !== 0) end++
  return new TextDecoder().decode(mem.subarray(ptr, end))
}

for (let p = 0; p < w.at_port_count(); p++) {
  console.log(
    p,
    JSON.stringify(str(w.at_port_name(p))),
    w.at_port_is_control_input(p) ? 'ctrl-in' : 'other',
    w.at_port_lower(p),
    w.at_port_upper(p)
  )
}
