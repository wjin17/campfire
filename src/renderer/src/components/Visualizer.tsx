import { useEffect, useRef, type RefObject } from 'react'
import type { AudioEngine } from '../audio/engine'
import { startSystemAudio, type SystemAudioHandle } from '../audio/system-audio'

interface VisualizerProps {
  engineRef: RefObject<AudioEngine>
  active: boolean
}

const FRAME_INTERVAL_MS = 1000 / 30
const BAR_COUNT = 24

export default function Visualizer({ engineRef, active }: VisualizerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const systemAudioRef = useRef<SystemAudioHandle | null>(null)

  // Lazily grab system audio (the song playing on the machine) once on
  // mount; the mic-driven analyser below is only a fallback for shells/
  // platforms where display-media loopback isn't available. Torn down
  // when the window is hidden (tray minimize) and re-acquired on show.
  useEffect(() => {
    let cancelled = false

    const start = async (): Promise<void> => {
      const handle = await startSystemAudio()
      if (cancelled) {
        handle?.stop()
        return
      }
      systemAudioRef.current = handle
    }
    void start()

    const onVisibilityChange = (): void => {
      if (document.hidden) {
        systemAudioRef.current?.stop()
        systemAudioRef.current = null
      } else if (!systemAudioRef.current) {
        void start()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      systemAudioRef.current?.stop()
      systemAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#ff5c7a'

    let width = canvas.clientWidth
    let height = canvas.clientHeight

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let raf = 0
    let lastFrame = 0
    const data = new Uint8Array(128)

    const draw = (t: number): void => {
      raf = requestAnimationFrame(draw)
      if (t - lastFrame < FRAME_INTERVAL_MS) return
      lastFrame = t

      ctx2d.clearRect(0, 0, width, height)

      const analyser =
        systemAudioRef.current?.analyser ?? (active ? engineRef.current.getAnalyser() : null)
      if (analyser) analyser.getByteFrequencyData(data)
      else data.fill(0)

      const barWidth = width / BAR_COUNT
      ctx2d.fillStyle = accent
      for (let i = 0; i < BAR_COUNT; i++) {
        const value = data[Math.floor((i / BAR_COUNT) * data.length)]
        const barHeight = analyser ? Math.max(2, (value / 255) * height) : 2
        ctx2d.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - 2), barHeight)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [engineRef, active])

  return <canvas ref={canvasRef} className="visualizer" />
}
