import { useEffect, useRef, useState } from 'react'
import { AudioEngine } from './audio/engine'
import { NOTE_ORDER, type NoteName, type Mode } from './audio/autotune/scale'
import Visualizer from './components/Visualizer'
import Tuner from './components/Tuner'
import Lyrics from './components/Lyrics'

type SettingsPartial = Parameters<typeof window.api.saveSettings>[0]
const SETTINGS_DEBOUNCE_MS = 300

export default function App(): React.JSX.Element {
  const engine = useRef(new AudioEngine())
  const [micOn, setMicOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [expanded, setExpanded] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [gain, setGain] = useState(1)
  const [reverb, setReverb] = useState(0.35)
  const [autotune, setAutotune] = useState(false)
  const [autotuneError, setAutotuneError] = useState(false)
  const [root, setRoot] = useState<NoteName>('C')
  const [mode, setMode] = useState<Mode>('chromatic')
  const [strength, setStrength] = useState(1)
  const [lyricsLeadMs, setLyricsLeadMs] = useState(250)

  const pendingSaveRef = useRef<SettingsPartial>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistDebounced = (partial: SettingsPartial): void => {
    pendingSaveRef.current = { ...pendingSaveRef.current, ...partial }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const toSave = pendingSaveRef.current
      pendingSaveRef.current = {}
      window.api.saveSettings(toSave)
    }, SETTINGS_DEBOUNCE_MS)
  }
  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      if (Object.keys(pendingSaveRef.current).length)
        window.api.saveSettings(pendingSaveRef.current)
    }
  }, [])

  const refreshDevices = async (): Promise<void> => {
    const all = await navigator.mediaDevices.enumerateDevices()
    setDevices(all.filter((d) => d.kind === 'audioinput'))
  }

  const micOnRef = useRef(micOn)
  const deviceIdRef = useRef(deviceId)
  const gainRef = useRef(gain)
  const reverbRef = useRef(reverb)
  useEffect(() => {
    micOnRef.current = micOn
    deviceIdRef.current = deviceId
    gainRef.current = gain
    reverbRef.current = reverb
  })

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setExpanded(settings.expanded)
      setGain(settings.micGain)
      setReverb(settings.reverbMix)
      setRoot(settings.autotune.root as NoteName)
      setMode(settings.autotune.mode as Mode)
      setStrength(settings.autotune.strength)
      setLyricsLeadMs(settings.lyricsLeadMs)
      // mic may already be running (started before this settled) — push the
      // loaded values into the live chain too, not just React state
      engine.current.setMicGain(settings.micGain)
      engine.current.setReverbMix(settings.reverbMix)
      setHydrated(true)
    })
  }, [])

  const toggleMicRef = useRef<() => void>(() => {})
  useEffect(() => {
    return window.api.onTrayMicToggle(() => toggleMicRef.current())
  }, [])

  useEffect(() => {
    window.api.setMicActive(micOn)
  }, [micOn])

  useEffect(() => {
    const onDeviceChange = async (): Promise<void> => {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter((d) => d.kind === 'audioinput')
      setDevices(inputs)
      if (
        micOnRef.current &&
        deviceIdRef.current &&
        !inputs.some((d) => d.deviceId === deviceIdRef.current)
      ) {
        setDeviceId('')
        setAutotune(false)
        try {
          await engine.current.start()
          engine.current.setMicGain(gainRef.current)
          engine.current.setReverbMix(reverbRef.current)
          setAutotuneError(!engine.current.autotuneAvailable)
        } catch {
          setMicOn(false)
          setMicError('Mic access denied — allow it and retry')
        }
      }
    }
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }, [])

  const toggleMic = async (): Promise<void> => {
    if (micOnRef.current) {
      engine.current.stop()
      setMicOn(false)
      setAutotune(false)
      return
    }
    try {
      setMicError(null)
      setAutotuneError(false)
      await engine.current.start(deviceIdRef.current || undefined)
      engine.current.setMicGain(gainRef.current)
      engine.current.setReverbMix(reverbRef.current)
      setMicOn(true)
      setAutotuneError(!engine.current.autotuneAvailable)
      refreshDevices()
    } catch {
      setMicError('Mic access denied — allow it and retry')
    }
  }
  useEffect(() => {
    toggleMicRef.current = toggleMic
  })

  const toggleAutotune = (): void => {
    const next = !autotune
    setAutotune(next)
    engine.current.setAutotuneEnabled(next, strength)
    window.api.saveSettings({ autotune: { enabled: next, root, mode, strength } })
  }

  const toggleExpanded = async (): Promise<void> => {
    const next = !expanded
    setExpanded(next)
    await window.api.setExpanded(next)
  }

  return (
    <div className={`widget ${hydrated ? '' : 'pre-hydrate'}`}>
      <div className="header">
        <button
          className={`mic-pill no-drag ${micOn ? 'btn-active' : ''}`}
          onClick={toggleMic}
          title={micOn ? 'Mic on' : 'Mic off'}
        >
          {micOn ? 'Mic On' : 'Mic Off'}
        </button>
        <Visualizer engineRef={engine} active={micOn} />
        <button
          className="icon-btn no-drag"
          onClick={toggleExpanded}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <span className={`chevron ${expanded ? 'chevron-up' : 'chevron-down'}`} />
        </button>
        <button
          className="icon-btn no-drag"
          onClick={() => window.api.minimizeToTray()}
          title="Minimize to tray"
        >
          &minus;
        </button>
      </div>

      {expanded && (
        <div className="expanded-body no-drag">
          <div className="section">
            <select
              className="select"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">Default mic</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Microphone'}
                </option>
              ))}
            </select>
            <label className="control">
              Gain
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={gain}
                onChange={(e) => {
                  const v = +e.target.value
                  setGain(v)
                  engine.current.setMicGain(v)
                  persistDebounced({ micGain: v })
                }}
              />
            </label>
            <label className="control">
              Reverb
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={reverb}
                onChange={(e) => {
                  const v = +e.target.value
                  setReverb(v)
                  engine.current.setReverbMix(v)
                  persistDebounced({ reverbMix: v })
                }}
              />
            </label>
          </div>

          <div className="divider" />

          <div className="section">
            <button
              className={`btn ${autotune ? 'btn-active' : ''}`}
              onClick={toggleAutotune}
              disabled={!micOn || autotuneError}
              title={autotuneError ? 'Autotune failed to load' : ''}
            >
              {autotune ? 'Autotune On' : 'Autotune Off'}
            </button>
            <select
              className="select"
              value={mode}
              disabled={!autotune}
              onChange={(e) => {
                const m = e.target.value as Mode
                setMode(m)
                engine.current.setAutotuneScale(root, m)
                window.api.saveSettings({
                  autotune: { enabled: autotune, root, mode: m, strength }
                })
              }}
            >
              <option value="chromatic">Chromatic</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
            <select
              className="select"
              value={root}
              disabled={!autotune || mode === 'chromatic'}
              onChange={(e) => {
                const r = e.target.value as NoteName
                setRoot(r)
                engine.current.setAutotuneScale(r, mode)
                window.api.saveSettings({
                  autotune: { enabled: autotune, root: r, mode, strength }
                })
              }}
            >
              {NOTE_ORDER.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label className="control">
              Strength
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={strength}
                disabled={!autotune}
                onChange={(e) => {
                  const v = +e.target.value
                  setStrength(v)
                  engine.current.setAutotuneStrength(v)
                  persistDebounced({ autotune: { enabled: autotune, root, mode, strength: v } })
                }}
              />
            </label>
          </div>

          <div className="divider" />

          <Lyrics leadMs={lyricsLeadMs} />

          <label className="control">
            Lyrics lead ({lyricsLeadMs} ms)
            <input
              type="range"
              min="-1000"
              max="1000"
              step="10"
              value={lyricsLeadMs}
              onChange={(e) => {
                const v = +e.target.value
                setLyricsLeadMs(v)
                persistDebounced({ lyricsLeadMs: v })
              }}
            />
          </label>

          <Tuner engineRef={engine} active={micOn} />
        </div>
      )}

      {micOn && <span className="warn">🎧 Use headphones — speakers will feed back</span>}
      {micError && <span className="error">{micError}</span>}
    </div>
  )
}
