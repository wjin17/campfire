# Karaoke Desktop v1 — Design

Date: 2026-07-23
Status: Approved

## Summary

A Windows desktop karaoke app: Electron + TypeScript shell embedding real
youtube.com in a webview for streaming karaoke videos (lyrics baked into the
video), while the user's mic runs through a local effects chain — large-studio
convolution reverb and a toggleable autotune (autotalent compiled to WASM).
Nothing is downloaded; playback stays inside YouTube's own player under the
user's own Google session.

## Goals

- Stream any YouTube karaoke video and sing along with live mic effects.
- Voice monitoring latency low enough to sing comfortably (target < ~40 ms
  round trip via Web Audio; acceptable for v1).
- Autotune toggle that snaps vocals to a chosen key/scale (or chromatic).
- Google login inside the app so a Premium account skips ads naturally.

## Non-goals (v1)

- Our own lyrics rendering or timing sync.
- Vocal removal / stem separation.
- Downloading, caching, or recording audio.
- Spotify (their DRM makes raw audio access impossible).
- Ad blocking or any YouTube client modification.

## Architecture

Electron, single `BrowserWindow`:

- **Main process**: window management; creates a `WebContentsView` hosting
  `https://youtube.com` sized to fill the window above a bottom control bar.
  The view uses a persistent session partition (`persist:youtube`) so login
  survives restarts. Its user agent is overridden to a plain Chrome UA so
  Google sign-in accepts the embedded browser.
- **App renderer**: React control bar UI + the entire audio graph. No audio
  work happens in the main process.
- **YouTube audio** plays directly from the webview, untouched. It and the
  processed mic signal simply meet at the OS output device; no in-app mixing.

## Mic audio chain (Web Audio)

```
getUserMedia (echoCancellation: false, noiseSuppression: false, autoGainControl: false)
  → autotalent AudioWorkletNode (WASM) — disconnected when toggled off
  → GainNode (mic gain)
  → split: dry ───────────────────────────────┐
           wet → ConvolverNode (large-hall IR) ┤ wet/dry mix (2 gains)
  → DynamicsCompressorNode (gentle, glue)
  → AudioContext.destination
```

- `AudioContext` created with `latencyHint: 'interactive'`.
- Chrome's voice-call processing (echo cancellation, noise suppression, AGC)
  must be disabled or it mangles sung vocals.
- Reverb impulse response: a CC-licensed large-hall IR from the OpenAIR
  library, bundled with the app. This approximates BandLab's "Large Studio".

## Autotune

- **autotalent** (Tom Baran, C, GPL) compiled to WASM with Emscripten and run
  inside an `AudioWorkletProcessor`.
- Controls: on/off toggle, key root + major/minor, a chromatic mode (no key
  needed, snaps to nearest semitone), and correction strength.
- Toggle off = the worklet node is disconnected from the chain entirely (not
  an internal passthrough), so it costs nothing when off.
- Riskiest component; built early but behind the bypass so the rest of the app
  is usable even if it slips.
- GPL note: fine for a personal app; only matters if this is ever distributed.

## UI (entire v1 surface)

Bottom control bar:

- Mic device picker, mic on/off, mic gain.
- Reverb amount (wet/dry).
- Autotune toggle, key + scale picker (incl. chromatic), strength.
- Headphone warning indicator when monitoring is live (mic → speakers next to
  a playing backing track feeds back).

Everything else on screen is YouTube's own UI inside the webview.

## Error handling

- Mic permission denied → inline prompt with retry.
- autotalent WASM fails to load → autotune toggle disabled with tooltip;
  reverb chain unaffected.
- Output/input device removed → rebuild chain on the new default device.

## Testing

- DSP unit tests with `OfflineAudioContext`: render known tones through the
  chain, assert output (e.g., autotune snaps a 445 Hz tone toward A440;
  reverb tail exists; bypass is bit-transparent).
- Latency and subjective sound quality verified manually.

## Future (post-v1)

- Own lyrics overlay synced via injected `video.currentTime` + LRCLIB lookup.
- Performance recording.
- Native audio sidecar (WASAPI exclusive) if Web Audio latency annoys.
