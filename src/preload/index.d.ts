import { ElectronAPI } from '@electron-toolkit/preload'
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

interface CampfireApi {
  wasmBytes: () => ArrayBuffer
  onNowPlaying: (cb: (msg: NowPlaying) => void) => () => void
  setExpanded: (expanded: boolean) => Promise<void>
  minimizeToTray: () => void
  setMicActive: (active: boolean) => void
  onTrayMicToggle: (cb: () => void) => () => void
  getSettings: () => Promise<Settings>
  saveSettings: (partial: Partial<Settings>) => Promise<Settings>
  payloadVersion: () => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CampfireApi
  }
}
