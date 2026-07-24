# Campfire v2 — Design

Date: 2026-07-23
Status: Approved (design reviewed in conversation)

## Summary

v2 turns the app from an embedded-YouTube karaoke browser into **Campfire**: a
small always-on-top desktop widget that provides live vocal effects (reverb +
autotune) and synced lyrics for whatever the user is already playing —
Spotify, YouTube in a browser, anything. Campfire never plays, captures, or
stores music; it consumes now-playing *metadata* only. The app is split into a
static shell and an auto-updating payload hosted on GitHub Releases
(github.com/wjin17/campfire), with a GitHub Pages download site.

## Goals

- Frameless, movable, always-on-top widget with two states:
  - **Small:** mic on/off, live audio visualizer (doubles as drag handle),
    expand button.
  - **Expanded:** gain, reverb, autotune (toggle/key/scale/strength), lyrics
    panel, on/off, visualizer, lyrics-lead slider.
- Minimize hides to tray; tray menu offers show/hide, mic toggle, quit.
- Song detection: browser extension (exact) + Windows system media API
  (broad); lyrics from LRCLIB, displayed with a default **+250 ms lead**
  (user-adjustable −1 s…+1 s).
- Shell/payload auto-update: renderer payload updates silently from GitHub
  Releases; the installed binary never changes.
- Public repo + GitHub Pages site with download links to latest releases.

## Non-goals

- Playing, downloading, recording, or fingerprinting audio.
- Vocal removal.
- macOS system-wide song detection (MediaRemote is locked down; Mac relies on
  the browser extension only).
- Shell self-update, installers, or code signing (unchanged from v1 stance).

## Naming

Product **Campfire**; repo `github.com/wjin17/campfire`; package name
`campfire`, productName `Campfire`, executableName `Campfire`, appId
`com.wjin17.campfire`. v1's YouTube layer (WebContentsView, persist:youtube
session, Firefox UA, back button, yt-back IPC) is deleted.

## Architecture: shell vs payload

**Shell** (static; `src/main`, `src/preload`, `resources/`):
- Frameless always-on-top BrowserWindow, transparent corners, drag via CSS
  `-webkit-app-region`; two fixed sizes (small ≈ 320×96, expanded ≈ 400×560);
  window position + expanded state persisted to userData settings.json.
- Tray icon: show/hide, mic on/off (relayed to renderer), quit.
- WebSocket server on `ws://127.0.0.1:17640` (localhost-bound): accepts JSON
  now-playing messages from the browser extension and relays them verbatim to
  the renderer via IPC. No message is ever executed or fetched.
- Windows now-playing helper: PowerShell script (`resources/smtc-poll.ps1`)
  using the WinRT GlobalSystemMediaTransportControls projection, polling every
  500 ms, emitting JSON lines on stdout; main spawns it on Windows only and
  relays lines to the renderer. (PowerShell avoids a .NET build toolchain; can
  be swapped for a compiled helper later without payload changes.)
- Payload loader (boot sequence):
  1. Read `userData/payloads/current.json` → `{version, dir}`.
  2. Load renderer from that dir if valid, else previous entry, else the
     payload bundled inside the app (`out/renderer`).
  3. After window load, check
     `https://api.github.com/repos/wjin17/campfire/releases/latest` for asset
     `payload-<semver>.zip` + `payload.json` (`{version, sha256, minShellApi}`).
  4. If newer than current and `minShellApi <= SHELL_API_VERSION`: download
     zip to `userData/payloads/<version>/`, verify sha256, extract, update
     current.json. Applied on next launch (no hot swap).
- `SHELL_API_VERSION = 1`: incremented only when the preload/IPC surface
  changes incompatibly.
- Preload API (`window.api`): `wasmBytes()` (from the *active payload dir*),
  `onNowPlaying(cb)`, `setMicActive(bool)` (tray sync), `onTrayMicToggle(cb)`,
  `setExpanded(bool)` (window resize), `minimizeToTray()`, `getSettings()` /
  `saveSettings(partial)`, `payloadVersion()`.

**Payload** (auto-updates; everything under `src/renderer`):
- Widget UI (React), both states, styling.
- Audio engine unchanged from v1 (mic constraints EC/NS/AGC false,
  latencyHint 0, reverb chain, autotalent worklet + wasm).
- Visualizer: AnalyserNode → canvas bar meter, ~30 fps, idle-flat when mic off.
- Lyrics stack (below).
- Now-playing arbitration: extension messages take priority over SMTC; a
  source is stale after 5 s without updates; position between updates is
  interpolated with wall-clock while `playing`.

## Now-playing message schema

```json
{ "source": "extension" | "smtc", "title": "...", "artist": "...",
  "position": 123.45, "duration": 240.0, "playing": true, "ts": 1690000000000 }
```
`artist` may be empty (YouTube titles often embed it). `ts` is sender wall
clock at capture, used for interpolation.

## Browser extension (`extension/` in repo, loaded unpacked / later store)

Chrome/Edge MV3. Content script on `*.youtube.com`: every 500 ms (and on
seek/play/pause) reads the active `<video>` `currentTime`/`duration`/paused +
`document.title` (cleaned of " - YouTube"), sends over a WebSocket to
`ws://127.0.0.1:17640`, silently retrying while Campfire isn't running.
No data leaves the machine.

## Lyrics

- Title cleanup: strip bracketed/parenthesized suffixes (`(Official Video)`,
  `[4K]`, `(Lyrics)`, `(Karaoke Version)` etc.), `feat./ft.` clauses, and
  split `Artist - Title` patterns when no artist field is present.
- Lookup: LRCLIB `GET /api/search?track_name=&artist_name=` (fallback:
  `q=` combined); pick best match by normalized title+artist similarity and
  closest duration; use `syncedLyrics` (.lrc). Cache per track in memory.
- Parse `.lrc` `[mm:ss.xx]` lines → sorted `{t, text}[]`.
- Display clock: `interpolatedPosition + lead` where `lead` defaults to
  0.25 s (slider −1…+1 s, persisted). Panel shows previous/current/next
  lines, current highlighted.
- No synced lyrics found → panel shows track title + "no synced lyrics".

## Tuner

autotalent already outputs detected pitch (port 27, semitones w.r.t. A) and
confidence (port 28). The wrapper gains `at_get_control(port)`; the worklet
posts `{pitch, confidence}` ~15×/s. To keep detection live with the effect
off, the worklet stays permanently in the chain — the autotune toggle now
drives correction strength/mix to zero instead of disconnecting the node.
UI (expanded state): nearest note name + cents-deviation needle (−50…+50),
dimmed when confidence is low. Scoring is deliberately out of scope; a
"vibes score" (and later melody-compare) can ship as a payload update.

## Website (GitHub Pages)

`/docs` folder on master, single static page (no build step): Campfire name,
one-line pitch, download buttons linking to
`https://github.com/wjin17/campfire/releases/latest/download/Campfire-windows.zip`
and `.../Campfire-mac-arm64.zip`, short install notes (Windows: unzip & run;
Mac: the xattr/codesign commands), and a note that the app updates itself.
Pages enabled from master `/docs`.

## Release flow (scripts in repo)

- `scripts/build-payload.mjs`: builds renderer, zips it as
  `payload-<version>.zip` + writes `payload.json` with sha256 (version from
  package.json).
- Shell artifacts: Windows `electron-builder --win dir` → zip the folder as
  `Campfire-windows.zip` (zip via Node archiver to avoid missing system zip);
  mac `--mac zip --arm64` renamed `Campfire-mac-arm64.zip`.
- Publish with `gh release create v<version>` uploading shell zips + payload
  zip + payload.json. Payload-only releases upload just the payload assets.

## Error handling

- Payload download/verify failure → keep current payload, log, retry next
  launch.
- WS port in use → shell retries once on 17641 and writes the active port to
  settings; extension tries both ports.
- SMTC helper crash → respawn with backoff, max 3.
- LRCLIB unreachable/no match → lyrics panel degrades gracefully, effects
  unaffected.
- Mic/autotune error handling carried over from v1.

## Testing

- Carried over: DSP suites (reverb, autotune snap), wasm/portmap/scale units.
- New units: lrc parser, title cleanup, LRCLIB match scoring, sync
  interpolation + lead math, payload manifest version/sha comparison.
- E2E probe (fake mic): widget boots from built-in payload, mic toggles,
  autotune engages, expanded state shows controls; a fake WS client feeds
  now-playing messages and the lyrics panel updates.

## Out of scope for v2

Vocal removal; Firefox/Safari extensions; Chrome Web Store publishing; mac
system detection; shell self-update; signed builds.
