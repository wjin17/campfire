import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: { wasmBytes: () => ArrayBuffer; ytBack: () => void }
  }
}
