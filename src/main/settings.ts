import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface AutotuneSettings {
  enabled: boolean
  root: string
  mode: string
  strength: number
}

export interface Settings {
  x?: number
  y?: number
  expanded: boolean
  micGain: number
  reverbMix: number
  autotune: AutotuneSettings
  lyricsLeadMs: number
  wsPort?: number
  lrclibBase?: string
}

const DEFAULT_SETTINGS: Settings = {
  expanded: false,
  micGain: 1,
  reverbMix: 0.35,
  autotune: { enabled: false, root: 'C', mode: 'chromatic', strength: 1 },
  lyricsLeadMs: 250
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  const path = settingsPath()
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS, autotune: { ...DEFAULT_SETTINGS.autotune } }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      autotune: { ...DEFAULT_SETTINGS.autotune, ...raw.autotune }
    }
  } catch {
    return { ...DEFAULT_SETTINGS, autotune: { ...DEFAULT_SETTINGS.autotune } }
  }
}

export function saveSettings(partial: Partial<Settings>): Settings {
  const current = loadSettings()
  const next: Settings = {
    ...current,
    ...partial,
    autotune: { ...current.autotune, ...partial.autotune }
  }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}
