import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { readFileSync } from 'fs'
import { join } from 'path'

const api = {
  wasmBytes: (): ArrayBuffer => {
    const buf = readFileSync(join(__dirname, '../renderer/worklet/autotalent.wasm'))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
