import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: { workletJs: () => string; wasmBytes: () => ArrayBuffer }
  }
}
