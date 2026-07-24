# Campfire Now Playing (browser extension)

Reads the active YouTube video's title/position/play-state and sends it to
the Campfire desktop app over `ws://127.0.0.1:17640` (falling back to
`17641`). No data leaves the machine.

## Load unpacked (Chrome/Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this `extension/` folder.
4. Open a YouTube video — Campfire picks up playback automatically once
   it's running.
