;(function () {
  const PORTS = [17640, 17641]
  const RECONNECT_DELAY_MS = 5000
  const POLL_INTERVAL_MS = 500

  let ws = null
  let portIndex = 0
  let reconnectTimer = null
  let attachedVideo = null

  function cleanTitle() {
    return document.title.replace(/ - YouTube$/, '')
  }

  function send() {
    const video = document.querySelector('video')
    if (!video || !ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        source: 'extension',
        title: cleanTitle(),
        artist: '',
        position: video.currentTime,
        duration: video.duration || 0,
        playing: !video.paused,
        ts: Date.now(),
        active: document.visibilityState === 'visible'
      })
    )
  }

  function attachVideoListeners(video) {
    video.addEventListener('play', send)
    video.addEventListener('pause', send)
    video.addEventListener('seeked', send)
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    portIndex = (portIndex + 1) % PORTS.length
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, RECONNECT_DELAY_MS)
  }

  function connect() {
    ws = new WebSocket(`ws://127.0.0.1:${PORTS[portIndex]}`)
    ws.addEventListener('open', send)
    ws.addEventListener('close', scheduleReconnect)
    ws.addEventListener('error', () => ws.close())
  }

  setInterval(() => {
    const video = document.querySelector('video')
    if (video && video !== attachedVideo) {
      attachedVideo = video
      attachVideoListeners(video)
    }
    send()
  }, POLL_INTERVAL_MS)

  connect()
})()
