import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { readFileSync } from 'fs'
import { join } from 'path'

const workletDir = join(__dirname, '../renderer/worklet')

const api = {
  workletJs: (): string => readFileSync(join(workletDir, 'autotalent-processor.js'), 'utf8'),
  wasmBytes: (): ArrayBuffer => {
    const buf = readFileSync(join(workletDir, 'autotalent.wasm'))
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
