import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Settings } from '../main/settings'

interface NowPlaying {
  source: 'extension' | 'smtc'
  title: string
  artist: string
  position: number
  duration: number
  playing: boolean
  ts: number
}

const api = {
  wasmBytes: (): ArrayBuffer => {
    const buf = readFileSync(join(__dirname, '../renderer/worklet/autotalent.wasm'))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  },
  onNowPlaying: (cb: (msg: NowPlaying) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, msg: NowPlaying): void => cb(msg)
    ipcRenderer.on('now-playing', listener)
    return () => ipcRenderer.removeListener('now-playing', listener)
  },
  setExpanded: (expanded: boolean): Promise<void> => ipcRenderer.invoke('set-expanded', expanded),
  minimizeToTray: (): void => {
    ipcRenderer.send('minimize-to-tray')
  },
  setMicActive: (active: boolean): void => {
    ipcRenderer.send('set-mic-active', active)
  },
  onTrayMicToggle: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('tray-mic-toggle', listener)
    return () => ipcRenderer.removeListener('tray-mic-toggle', listener)
  },
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (partial: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('save-settings', partial),
  payloadVersion: (): Promise<string> => ipcRenderer.invoke('payload-version')
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
