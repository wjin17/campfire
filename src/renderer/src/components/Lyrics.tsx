import { useEffect, useRef, useState } from 'react'
import type { NowPlaying } from '../types/nowplaying'
import { LyricsClock, currentLineIndex } from '../lyrics/sync'
import { parseLrc, type LrcLine } from '../lyrics/lrc'
import { searchLyrics, setLrclibBase } from '../lyrics/lrclib'

interface LyricsProps {
  leadMs: number
  mode: 'line' | 'panel'
}

type Status = 'nothing' | 'loading' | 'no-sync' | 'ready'

const UPDATE_INTERVAL_MS = 250

export default function Lyrics({ leadMs, mode }: LyricsProps): React.JSX.Element {
  const clockRef = useRef(new LyricsClock())
  const trackKeyRef = useRef<string | null>(null)
  const leadMsRef = useRef(leadMs)
  const [lines, setLines] = useState<LrcLine[]>([])
  const [status, setStatus] = useState<Status>('nothing')
  const [lineIndex, setLineIndex] = useState(-1)

  useEffect(() => {
    leadMsRef.current = leadMs
  }, [leadMs])

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      if (settings.lrclibBase) setLrclibBase(settings.lrclibBase)
    })
  }, [])

  useEffect(() => {
    return window.api.onNowPlaying((msg: NowPlaying) => {
      clockRef.current.update(msg)
      const track = clockRef.current.activeTrack()
      if (!track || track.key === trackKeyRef.current) return
      trackKeyRef.current = track.key
      setStatus('loading')
      setLines([])
      setLineIndex(-1)
      searchLyrics(track.title, track.artist, track.duration).then((lrc) => {
        if (trackKeyRef.current !== track.key) return
        if (!lrc) {
          setStatus('no-sync')
          return
        }
        setLines(parseLrc(lrc))
        setStatus('ready')
      })
    })
  }, [])

  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (t: number): void => {
      raf = requestAnimationFrame(tick)
      if (t - last < UPDATE_INTERVAL_MS) return
      last = t
      if (lines.length === 0) return
      setLineIndex(currentLineIndex(lines, clockRef.current.now(leadMsRef.current)))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lines])

  const panelClass = mode === 'panel' ? 'lyrics-panel' : ''
  // Only ever shows real synced lines — no "Nothing playing"/"no synced
  // lyrics" placeholder text. When there's nothing to show, the wrapper
  // stays mounted but collapses to zero height (see .lyrics-hidden) so the
  // space it occupied animates away instead of popping.
  const visible = status === 'ready'

  const prev = visible && lineIndex > 0 ? lines[lineIndex - 1].text : ''
  const current = visible && lineIndex >= 0 ? lines[lineIndex].text : ''
  const next =
    visible && lineIndex >= 0 && lineIndex + 1 < lines.length ? lines[lineIndex + 1].text : ''

  return (
    <div className={`lyrics ${panelClass} ${visible ? '' : 'lyrics-hidden'}`}>
      <div className="lyrics-line lyrics-prev">{prev}</div>
      <div className="lyrics-line lyrics-current" key={lineIndex}>
        {current}
      </div>
      <div className="lyrics-line lyrics-next">{next}</div>
    </div>
  )
}
