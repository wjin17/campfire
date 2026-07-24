import { useEffect, useRef, useState } from 'react'
import { AudioEngine } from './audio/engine'
import { NOTE_ORDER, type NoteName, type Mode } from './audio/autotune/scale'

export default function App(): React.JSX.Element {
  const engine = useRef(new AudioEngine())
  const [micOn, setMicOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [gain, setGain] = useState(1)
  const [reverb, setReverb] = useState(0.35)
  const [autotune, setAutotune] = useState(false)
  const [autotuneError, setAutotuneError] = useState(false)
  const [root, setRoot] = useState<NoteName>('C')
  const [mode, setMode] = useState<Mode>('chromatic')
  const [strength, setStrength] = useState(1)

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
    if (micOn) {
      engine.current.stop()
      setMicOn(false)
      setAutotune(false)
      return
    }
    try {
      setMicError(null)
      setAutotuneError(false)
      await engine.current.start(deviceId || undefined)
      engine.current.setMicGain(gain)
      engine.current.setReverbMix(reverb)
      setMicOn(true)
      refreshDevices()
    } catch {
      setMicError('Mic access denied — allow it and retry')
    }
  }

  const toggleAutotune = async (): Promise<void> => {
    if (autotune) {
      engine.current.disableAutotune()
      setAutotune(false)
      return
    }
    try {
      await engine.current.enableAutotune()
      engine.current.setAutotuneStrength(strength)
      engine.current.setAutotuneScale(root, mode)
      setAutotune(true)
    } catch {
      setAutotuneError(true)
    }
  }

  return (
    <div className="bar">
      <div className="bar-group">
        <button className={`btn ${micOn ? 'btn-active' : ''}`} onClick={toggleMic}>
          {micOn ? 'Mic Off' : 'Mic On'}
        </button>
        <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
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
              setGain(+e.target.value)
              engine.current.setMicGain(+e.target.value)
            }}
          />
        </label>
      </div>
      <div className="bar-divider" />
      <div className="bar-group">
        <label className="control">
          Reverb
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={reverb}
            onChange={(e) => {
              setReverb(+e.target.value)
              engine.current.setReverbMix(+e.target.value)
            }}
          />
        </label>
      </div>
      <div className="bar-divider" />
      <div className="bar-group">
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
              setStrength(+e.target.value)
              engine.current.setAutotuneStrength(+e.target.value)
            }}
          />
        </label>
      </div>
      {micOn && <span className="warn">🎧 Use headphones — speakers will feed back</span>}
      {micError && <span className="error">{micError}</span>}
    </div>
  )
}
