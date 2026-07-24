import { useEffect, useState, type RefObject } from 'react'
import type { AudioEngine } from '../audio/engine'
import { semitonesToNote, CONFIDENCE_THRESHOLD } from '../audio/tuner'

interface TunerProps {
  engineRef: RefObject<AudioEngine>
  active: boolean
}

export default function Tuner({ engineRef, active }: TunerProps): React.JSX.Element {
  const [pitch, setPitch] = useState<{ semitones: number; confidence: number } | null>(null)

  useEffect(() => {
    if (!active) return
    const engine = engineRef.current
    engine.onPitch(setPitch)
    return () => engine.onPitch(null)
  }, [engineRef, active])

  const confident = active && (pitch?.confidence ?? 0) >= CONFIDENCE_THRESHOLD
  const { note, cents } =
    pitch && confident ? semitonesToNote(pitch.semitones) : { note: '--', cents: 0 }

  return (
    <div className={`tuner ${confident ? '' : 'tuner-dim'}`}>
      <span className="tuner-note">{note}</span>
      <div className="tuner-needle-track">
        <span className="tuner-needle-center" />
        <span className="tuner-needle" style={{ left: `${50 + cents}%` }} />
      </div>
      <span className="tuner-cents">{confident ? `${cents > 0 ? '+' : ''}${cents}¢` : ''}</span>
    </div>
  )
}
