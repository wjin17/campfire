export interface SystemAudioHandle {
  analyser: AnalyserNode
  stop: () => void
}

// Captures whatever the OS is playing (Windows loopback, via the shell's
// setDisplayMediaRequestHandler) for visualization only. Never connected to
// destination — this must not echo audio back out, record, or store anything.
// On shells/platforms without the handler (older shell, macOS), getDisplayMedia
// rejects and callers fall back to the mic analyser.
export async function startSystemAudio(): Promise<SystemAudioHandle | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) return null

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
  } catch {
    return null
  }

  stream.getVideoTracks().forEach((t) => t.stop())
  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    return null
  }

  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  source.connect(analyser)

  return {
    analyser,
    stop: (): void => {
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
  }
}
