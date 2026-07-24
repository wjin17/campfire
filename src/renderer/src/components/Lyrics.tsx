import { useEffect, useRef, useState } from 'react'
import type { NowPlaying } from '../types/nowplaying'
import { LyricsClock, currentLineIndex } from '../lyrics/sync'
import { cleanTitle } from '../lyrics/clean'
import { parseLrc, type LrcLine } from '../lyrics/lrc'
import { searchLyrics, setLrclibBase } from '../lyrics/lrclib'

interface LyricsProps {
  leadMs: number
}

type Status = 'nothing' | 'loading' | 'no-sync' | 'ready'

const UPDATE_INTERVAL_MS = 250

export default function Lyrics({ leadMs }: LyricsProps): React.JSX.Element {
  const clockRef = useRef(new LyricsClock())
  const trackKeyRef = useRef<string | null>(null)
  const leadMsRef = useRef(leadMs)
  const [lines, setLines] = useState<LrcLine[]>([])
  const [status, setStatus] = useState<Status>('nothing')
  const [trackTitle, setTrackTitle] = useState('')
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
      const { title, artist } = cleanTitle(msg.title)
      const resolvedArtist = artist ?? msg.artist
      const key = `${title}|${resolvedArtist}`
      if (key === trackKeyRef.current) return
      trackKeyRef.current = key
      setTrackTitle(title)
      setStatus('loading')
      setLines([])
      setLineIndex(-1)
      searchLyrics(title, resolvedArtist, msg.duration).then((lrc) => {
        if (trackKeyRef.current !== key) return
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

  if (status === 'nothing') {
    return <div className="lyrics lyrics-empty">Nothing playing</div>
  }
  if (status === 'no-sync') {
    return <div className="lyrics lyrics-empty">No synced lyrics — {trackTitle}</div>
  }

  const prev = lineIndex > 0 ? lines[lineIndex - 1].text : ''
  const current = lineIndex >= 0 ? lines[lineIndex].text : ''
  const next = lineIndex >= 0 && lineIndex + 1 < lines.length ? lines[lineIndex + 1].text : ''

  return (
    <div className="lyrics">
      <div className="lyrics-line lyrics-prev">{prev}</div>
      <div className="lyrics-line lyrics-current" key={lineIndex}>
        {current}
      </div>
      <div className="lyrics-line lyrics-next">{next}</div>
    </div>
  )
}
