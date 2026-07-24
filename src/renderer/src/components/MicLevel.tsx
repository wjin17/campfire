import { useEffect, useState, type RefObject } from 'react'
import type { AudioEngine } from '../audio/engine'

interface MicLevelProps {
  engineRef: RefObject<AudioEngine>
  active: boolean
}

const FRAME_INTERVAL_MS = 1000 / 20
const SMOOTHING = 0.6
// Rough RMS-to-fill scale so ordinary speech levels read as a mostly-filled bar.
const RMS_GAIN = 4

export default function MicLevel({ engineRef, active }: MicLevelProps): React.JSX.Element {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!active) return
    let raf = 0
    let lastFrame = 0
    let smoothed = 0
    const data = new Float32Array(512)

    const tick = (t: number): void => {
      raf = requestAnimationFrame(tick)
      if (t - lastFrame < FRAME_INTERVAL_MS) return
      lastFrame = t

      const analyser = engineRef.current.getMicAnalyser()
      if (analyser) {
        analyser.getFloatTimeDomainData(data)
        let sumSq = 0
        for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i]
        const rms = Math.sqrt(sumSq / data.length)
        smoothed += (rms - smoothed) * SMOOTHING
      } else {
        smoothed = 0
      }
      setLevel(Math.min(1, smoothed * RMS_GAIN))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engineRef, active])

  return (
    <div className="mic-level" aria-hidden="true">
      <div className="mic-level-fill" style={{ width: `${level * 100}%` }} />
    </div>
  )
}
