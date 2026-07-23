# Karaoke Desktop v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows desktop karaoke app: embedded youtube.com webview for streaming karaoke videos, with the mic running through a local Web Audio chain (large-hall convolution reverb + toggleable autotalent WASM autotune).

**Architecture:** Electron (electron-vite, React + TS). Main process owns the window and a `WebContentsView` hosting youtube.com on a persistent session with a Chrome-spoofed UA. The app renderer owns the entire audio graph and the bottom control bar. YouTube audio is never touched; only the mic is processed.

**Tech Stack:** Electron + electron-vite + React + TypeScript, Web Audio API, autotalent 0.2 (C → WASM via Emscripten), Vitest (unit), Playwright (DSP tests in headless Chromium via OfflineAudioContext).

## Global Constraints

- TypeScript everywhere except `src/renderer/public/worklet/autotalent-processor.js` (AudioWorklet file served unbundled — plain JS by design).
- Mic capture MUST use `echoCancellation: false, noiseSuppression: false, autoGainControl: false`.
- `AudioContext` created with `latencyHint: 'interactive'`.
- YouTube webview partition MUST be `persist:youtube`. No ad-blocking, no YouTube DOM modification.
- autotalent is GPL — vendored sources stay in-repo (`native/autotalent/`).
- No code comments unless the WHY is non-obvious. No JSDoc. No abstractions beyond what tasks specify.
- Dev happens in WSL2 (build + all automated tests work there). Real-audio manual checks happen on Windows.
- Known limitation, do not fight it: autotalent has internal lookahead (~25–45 ms added latency when enabled). Acceptable for v1.

---

### Task 1: Scaffold Electron app + test tooling

**Files:**
- Create: entire electron-vite react-ts template at repo root (`src/main/`, `src/preload/`, `src/renderer/`, `electron.vite.config.ts`, `package.json`, …)
- Modify: `package.json` (name, scripts)

**Interfaces:**
- Produces: working `npm run build`, `npm run test:unit` (vitest), `npm run test:dsp` (playwright), template layout later tasks assume: renderer root at `src/renderer` with `index.html` + `src/` inside it.

- [ ] **Step 1: Scaffold template into repo root**

```bash
cd /home/dobby/projects/karaoke
npm create @quick-start/electron@latest karaoke-tmp -- --template react-ts
cp -r karaoke-tmp/. .
rm -rf karaoke-tmp
```

If the scaffolder prompts, answer: no Electron updater mirror, yes install deps is fine to skip (we run `npm i` next).

- [ ] **Step 2: Set name and install**

In `package.json` set `"name": "karaoke"`. Then:

```bash
npm install
npm install -D vitest @playwright/test
npx playwright install chromium
```

- [ ] **Step 3: Add test scripts**

In `package.json` `"scripts"` add:

```json
"test:unit": "vitest run",
"test:dsp": "playwright test"
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: exits 0, `out/` directory produced.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold electron-vite react-ts app with vitest and playwright"
```

---

### Task 2: Chrome UA spoof + YouTube WebContentsView

**Files:**
- Create: `src/main/ua.ts`, `tests/unit/ua.test.ts`
- Modify: `src/main/index.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `toChromeUA(ua: string): string`; main window layout reserving `CONTROL_BAR_HEIGHT = 96` px at the bottom for the app renderer, YouTube view above it.

- [ ] **Step 1: Write the failing test**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] }
})
```

`tests/unit/ua.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toChromeUA } from '../../src/main/ua'

describe('toChromeUA', () => {
  it('strips Electron and app tokens', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) karaoke/1.0.0 Chrome/126.0.0.0 Electron/31.0.0 Safari/537.36'
    expect(toChromeUA(ua)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — cannot resolve `src/main/ua`.

- [ ] **Step 3: Implement**

`src/main/ua.ts`:

```ts
export function toChromeUA(ua: string): string {
  return ua
    .replace(/\skaraoke\/\S+/i, '')
    .replace(/\sElectron\/\S+/, '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Wire the YouTube view into the main process**

Replace the window-creation code in `src/main/index.ts` (keep the template's app lifecycle boilerplate and renderer loading) with:

```ts
import { app, BrowserWindow, WebContentsView, session, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { toChromeUA } from './ua'

const CONTROL_BAR_HEIGHT = 96

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media'
  })

  const ytSession = session.fromPartition('persist:youtube')
  ytSession.setUserAgent(toChromeUA(ytSession.getUserAgent()))

  const yt = new WebContentsView({
    webPreferences: { partition: 'persist:youtube' }
  })
  win.contentView.addChildView(yt)

  const layout = (): void => {
    const { width, height } = win.getContentBounds()
    yt.setBounds({ x: 0, y: 0, width, height: Math.max(0, height - CONTROL_BAR_HEIGHT) })
  }
  win.on('resize', layout)
  layout()

  yt.webContents.setWindowOpenHandler(({ url }) => {
    yt.webContents.loadURL(url)
    return { action: 'deny' }
  })
  yt.webContents.loadURL('https://www.youtube.com')

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
```

Keep the rest of the template file (app.whenReady, activate handler, window-all-closed) unchanged, calling this `createWindow`.

- [ ] **Step 6: Verify build + manual smoke test**

Run: `npm run build` — expected: exits 0.
Manual (WSLg or Windows): `npm run dev` — YouTube loads filling the window above a 96 px strip showing the template renderer; signing into Google works without a "browser not secure" block; login survives an app restart.

- [ ] **Step 7: Commit**

```bash
git add src/main/ua.ts src/main/index.ts tests/unit/ua.test.ts vitest.config.ts
git commit -m "feat: embed youtube webview with persistent session and chrome UA"
```

---

### Task 3: Reverb IR generator + wet/dry math (pure DSP helpers)

**Files:**
- Create: `src/renderer/src/audio/reverb.ts`, `src/renderer/src/audio/mix.ts`
- Test: `tests/unit/reverb.test.ts`, `tests/unit/mix.test.ts`

**Interfaces:**
- Produces: `generateHallIR(sampleRate: number, rng?: () => number): [Float32Array, Float32Array]` (stereo IR, 3.2 s, 20 ms predelay, decaying lowpassed noise ≈ large-studio hall); `mixGains(mix: number): { dry: number; wet: number }` (equal-power, mix 0..1).

- [ ] **Step 1: Write the failing tests**

`tests/unit/reverb.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateHallIR } from '../../src/renderer/src/audio/reverb'

function energy(a: Float32Array, from: number, to: number): number {
  let e = 0
  for (let i = from; i < to; i++) e += a[i] * a[i]
  return e
}

describe('generateHallIR', () => {
  const sr = 44100
  let s = 1
  const rng = () => (s = (s * 16807) % 2147483647) / 2147483647
  const [l, r] = generateHallIR(sr, rng)

  it('is 3.2s stereo', () => {
    expect(l.length).toBe(Math.floor(sr * 3.2))
    expect(r.length).toBe(l.length)
  })

  it('has 20ms of predelay silence', () => {
    const pre = Math.floor(sr * 0.02)
    expect(energy(l, 0, pre)).toBe(0)
    expect(l[pre + 100]).not.toBe(0)
  })

  it('decays over time', () => {
    const q = Math.floor(l.length / 4)
    expect(energy(l, 0, q)).toBeGreaterThan(energy(l, 3 * q, 4 * q) * 10)
  })

  it('channels are decorrelated', () => {
    expect(l[Math.floor(sr * 0.5)]).not.toBe(r[Math.floor(sr * 0.5)])
  })
})
```

`tests/unit/mix.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mixGains } from '../../src/renderer/src/audio/mix'

describe('mixGains', () => {
  it('is dry-only at 0 and wet-only at 1', () => {
    expect(mixGains(0)).toEqual({ dry: 1, wet: 0 })
    expect(mixGains(1).dry).toBeCloseTo(0)
    expect(mixGains(1).wet).toBeCloseTo(1)
  })

  it('is equal-power at midpoint', () => {
    const { dry, wet } = mixGains(0.5)
    expect(dry * dry + wet * wet).toBeCloseTo(1)
    expect(dry).toBeCloseTo(wet)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/renderer/src/audio/reverb.ts`:

```ts
const SECONDS = 3.2
const PREDELAY_S = 0.02
const DECAY_POW = 2.4

export function generateHallIR(
  sampleRate: number,
  rng: () => number = Math.random
): [Float32Array, Float32Array] {
  const length = Math.floor(sampleRate * SECONDS)
  const predelay = Math.floor(sampleRate * PREDELAY_S)
  const out: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)]
  for (const ch of out) {
    let lp = 0
    for (let i = predelay; i < length; i++) {
      const t = (i - predelay) / (length - predelay)
      lp += 0.35 * (rng() * 2 - 1 - lp)
      ch[i] = lp * Math.pow(1 - t, DECAY_POW)
    }
  }
  return out
}
```

`src/renderer/src/audio/mix.ts`:

```ts
export function mixGains(mix: number): { dry: number; wet: number } {
  const m = Math.min(1, Math.max(0, mix))
  return { dry: Math.cos((m * Math.PI) / 2), wet: Math.sin((m * Math.PI) / 2) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/audio/reverb.ts src/renderer/src/audio/mix.ts tests/unit/reverb.test.ts tests/unit/mix.test.ts
git commit -m "feat: hall IR generator and equal-power mix gains"
```

---

### Task 4: AudioEngine + browser DSP test harness

**Files:**
- Create: `src/renderer/src/audio/engine.ts`
- Create: `src/renderer/harness.html`, `src/renderer/src/harness.ts`
- Create: `playwright.config.ts`, `tests/dsp/reverb.spec.ts`

**Interfaces:**
- Consumes: `generateHallIR`, `mixGains` from Task 3.
- Produces: `class AudioEngine` with `start(deviceId?: string): Promise<void>`, `stop(): void`, `setMicGain(v: number)`, `setReverbMix(v: number)`, `micStream: MediaStream | null`; exported graph builder `buildChain(ctx: BaseAudioContext, source: AudioNode): Chain` where `Chain = { micGain: GainNode; dryGain: GainNode; wetGain: GainNode; convolver: ConvolverNode; compressor: DynamicsCompressorNode }` — exported so the harness and Task 7 reuse identical wiring.

- [ ] **Step 1: Implement the engine**

`src/renderer/src/audio/engine.ts`:

```ts
import { generateHallIR } from './reverb'
import { mixGains } from './mix'

export interface Chain {
  micGain: GainNode
  dryGain: GainNode
  wetGain: GainNode
  convolver: ConvolverNode
  compressor: DynamicsCompressorNode
}

export function buildChain(ctx: BaseAudioContext, source: AudioNode): Chain {
  const micGain = ctx.createGain()
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  const convolver = ctx.createConvolver()
  const compressor = ctx.createDynamicsCompressor()

  const [l, r] = generateHallIR(ctx.sampleRate)
  const ir = ctx.createBuffer(2, l.length, ctx.sampleRate)
  ir.copyToChannel(l, 0)
  ir.copyToChannel(r, 1)
  convolver.buffer = ir

  compressor.threshold.value = -18
  compressor.ratio.value = 3
  compressor.attack.value = 0.01
  compressor.release.value = 0.2

  source.connect(micGain)
  micGain.connect(dryGain)
  micGain.connect(convolver)
  convolver.connect(wetGain)
  dryGain.connect(compressor)
  wetGain.connect(compressor)
  compressor.connect(ctx.destination)

  const { dry, wet } = mixGains(0.35)
  dryGain.gain.value = dry
  wetGain.gain.value = wet
  return { micGain, dryGain, wetGain, convolver, compressor }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private chain: Chain | null = null
  micStream: MediaStream | null = null

  async start(deviceId?: string): Promise<void> {
    this.stop()
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    const source = this.ctx.createMediaStreamSource(this.micStream)
    this.chain = buildChain(this.ctx, source)
  }

  stop(): void {
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close()
    this.ctx = null
    this.chain = null
    this.micStream = null
  }

  setMicGain(v: number): void {
    if (this.chain) this.chain.micGain.gain.value = v
  }

  setReverbMix(v: number): void {
    if (!this.chain) return
    const { dry, wet } = mixGains(v)
    this.chain.dryGain.gain.value = dry
    this.chain.wetGain.gain.value = wet
  }
}
```

- [ ] **Step 2: Create the harness**

`src/renderer/harness.html`:

```html
<!DOCTYPE html>
<html>
  <body>
    <script type="module" src="/src/harness.ts"></script>
  </body>
</html>
```

`src/renderer/src/harness.ts`:

```ts
import { buildChain } from './audio/engine'
import { mixGains } from './audio/mix'

async function renderImpulseThroughChain(mix: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 44100 * 3, 44100)
  const buf = ctx.createBuffer(1, 44100 * 3, 44100)
  buf.getChannelData(0)[0] = 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const chain = buildChain(ctx, src)
  const { dry, wet } = mixGains(mix)
  chain.dryGain.gain.value = dry
  chain.wetGain.gain.value = wet
  src.start()
  const rendered = await ctx.startRendering()
  return rendered.getChannelData(0)
}

declare global {
  interface Window {
    testReverbTail: () => Promise<{ early: number; tail: number }>
    testDryOnly: () => Promise<number>
  }
}

window.testReverbTail = async () => {
  const data = await renderImpulseThroughChain(0.5)
  const energy = (from: number, to: number) => {
    let e = 0
    for (let i = from; i < to; i++) e += data[i] * data[i]
    return e
  }
  return { early: energy(0, 44100), tail: energy(44100, 88200) }
}

window.testDryOnly = async () => {
  const data = await renderImpulseThroughChain(0)
  let tail = 0
  for (let i = 4410; i < data.length; i++) tail += Math.abs(data[i])
  return tail
}
```

- [ ] **Step 3: Write the failing Playwright test**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/dsp',
  webServer: {
    command: 'npx vite serve src/renderer --port 8788 --strictPort',
    url: 'http://localhost:8788/harness.html',
    reuseExistingServer: true
  },
  use: { baseURL: 'http://localhost:8788' }
})
```

`tests/dsp/reverb.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('reverb produces a tail after the first second', async ({ page }) => {
  await page.goto('/harness.html')
  const { early, tail } = await page.evaluate('window.testReverbTail()') as { early: number; tail: number }
  expect(early).toBeGreaterThan(0)
  expect(tail).toBeGreaterThan(0.000001)
})

test('mix 0 is effectively dry', async ({ page }) => {
  await page.goto('/harness.html')
  const tail = (await page.evaluate('window.testDryOnly()')) as number
  expect(tail).toBeLessThan(0.001)
})
```

- [ ] **Step 4: Run DSP tests**

Run: `npm run test:dsp`
Expected: PASS (2 tests). If the first run fails because the engine file has a bug, fix and re-run — the harness is the debugging surface.

- [ ] **Step 5: Verify unit tests still pass and build works**

Run: `npm run test:unit && npm run build`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/audio/engine.ts src/renderer/harness.html src/renderer/src/harness.ts playwright.config.ts tests/dsp/reverb.spec.ts
git commit -m "feat: audio engine with reverb chain and playwright dsp harness"
```

---

### Task 5: autotalent WASM build

**Files:**
- Create: `native/autotalent/` (vendored `autotalent.c`, `mayer_fft.c`, `mayer_fft.h`, `ladspa.h`), `native/autotalent/wrapper.c`, `native/autotalent/build.sh`
- Create: `scripts/dump-ports.mjs`
- Output: `src/renderer/public/worklet/autotalent.wasm` (committed)
- Test: `tests/unit/wasm.test.ts`

**Interfaces:**
- Produces: WASM exporting `at_init(sampleRate, maxBlock): number`, `at_port_count(): number`, `at_port_name(p): ptr`, `at_port_is_control_input(p): number`, `at_port_lower(p): number`, `at_port_upper(p): number`, `at_set_control(p, v): void`, `at_in_ptr(): ptr`, `at_out_ptr(): ptr`, `at_process(n): void`, plus `memory`.

- [ ] **Step 1: Install emsdk (once)**

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
~/emsdk/emsdk install latest && ~/emsdk/emsdk activate latest
source ~/emsdk/emsdk_env.sh
emcc --version
```

Expected: emcc version prints.

- [ ] **Step 2: Vendor sources**

```bash
mkdir -p native/autotalent
cd native/autotalent
curl -fLO http://tombaran.info/autotalent-0.2.tar.gz
tar xzf autotalent-0.2.tar.gz --strip-components=1
rm autotalent-0.2.tar.gz
ls
```

Expected: `autotalent.c`, `mayer_fft.c`, `mayer_fft.h` present. If `ladspa.h` is not in the tarball:

```bash
curl -fsSL https://raw.githubusercontent.com/swh/ladspa/master/ladspa.h -o ladspa.h
```

If tombaran.info is down, find the `autotalent-0.2` source mirrored on GitHub (search `autotalent mayer_fft`) and vendor the same three files.

- [ ] **Step 3: Write the wrapper**

`native/autotalent/wrapper.c`:

```c
#include <stdlib.h>
#include "ladspa.h"

extern const LADSPA_Descriptor *ladspa_descriptor(unsigned long i);

static const LADSPA_Descriptor *desc;
static LADSPA_Handle inst;
static LADSPA_Data controls[64];
static LADSPA_Data *inbuf, *outbuf;

int at_init(unsigned long sample_rate, unsigned long max_block) {
  desc = ladspa_descriptor(0);
  if (!desc) return -1;
  inst = desc->instantiate(desc, sample_rate);
  if (!inst) return -2;
  inbuf = malloc(max_block * sizeof(LADSPA_Data));
  outbuf = malloc(max_block * sizeof(LADSPA_Data));
  for (unsigned long p = 0; p < desc->PortCount; p++) {
    LADSPA_PortDescriptor pd = desc->PortDescriptors[p];
    if (LADSPA_IS_PORT_AUDIO(pd)) {
      desc->connect_port(inst, p, LADSPA_IS_PORT_INPUT(pd) ? inbuf : outbuf);
    } else {
      controls[p] = 0;
      desc->connect_port(inst, p, &controls[p]);
    }
  }
  if (desc->activate) desc->activate(inst);
  return 0;
}

unsigned long at_port_count(void) { return desc->PortCount; }
const char *at_port_name(unsigned long p) { return desc->PortNames[p]; }
int at_port_is_control_input(unsigned long p) {
  LADSPA_PortDescriptor pd = desc->PortDescriptors[p];
  return LADSPA_IS_PORT_CONTROL(pd) && LADSPA_IS_PORT_INPUT(pd);
}
float at_port_lower(unsigned long p) { return desc->PortRangeHints[p].LowerBound; }
float at_port_upper(unsigned long p) { return desc->PortRangeHints[p].UpperBound; }
void at_set_control(unsigned long p, float v) { controls[p] = v; }
float *at_in_ptr(void) { return inbuf; }
float *at_out_ptr(void) { return outbuf; }
void at_process(unsigned long n) { desc->run(inst, n); }
```

- [ ] **Step 4: Write the build script**

`native/autotalent/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ../../src/renderer/public/worklet
emcc -O3 --no-entry wrapper.c autotalent.c mayer_fft.c -I. \
  -s STANDALONE_WASM=1 \
  -s EXPORTED_FUNCTIONS=_at_init,_at_port_count,_at_port_name,_at_port_is_control_input,_at_port_lower,_at_port_upper,_at_set_control,_at_in_ptr,_at_out_ptr,_at_process,_malloc,_free \
  -o ../../src/renderer/public/worklet/autotalent.wasm
```

Run: `chmod +x native/autotalent/build.sh && native/autotalent/build.sh`
Expected: `src/renderer/public/worklet/autotalent.wasm` exists. If emcc reports missing symbols from LADSPA hints, add `-Wno-implicit-function-declaration`.

- [ ] **Step 5: Write the port-dump script**

`scripts/dump-ports.mjs`:

```js
import { readFile } from 'node:fs/promises'

const stub = () => new Proxy({}, { get: () => () => 0 })
const bytes = await readFile('src/renderer/public/worklet/autotalent.wasm')
const { instance } = await WebAssembly.instantiate(bytes, {
  env: stub(),
  wasi_snapshot_preview1: stub()
})
const w = instance.exports
if (w.at_init(44100, 128) !== 0) throw new Error('at_init failed')

const str = (ptr) => {
  const mem = new Uint8Array(w.memory.buffer)
  let end = ptr
  while (mem[end] !== 0) end++
  return new TextDecoder().decode(mem.subarray(ptr, end))
}

for (let p = 0; p < w.at_port_count(); p++) {
  console.log(
    p,
    JSON.stringify(str(w.at_port_name(p))),
    w.at_port_is_control_input(p) ? 'ctrl-in' : 'other',
    w.at_port_lower(p),
    w.at_port_upper(p)
  )
}
```

Run: `node scripts/dump-ports.mjs`
Expected: a list of ~28+ ports with names. Save this output — Task 6 calibrates against it.

- [ ] **Step 6: Write the failing wasm smoke test**

`tests/unit/wasm.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'

let w: any

beforeAll(async () => {
  const stub = () => new Proxy({}, { get: () => () => 0 })
  const bytes = await readFile('src/renderer/public/worklet/autotalent.wasm')
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: stub(),
    wasi_snapshot_preview1: stub()
  })
  w = instance.exports
})

describe('autotalent wasm', () => {
  it('initializes', () => {
    expect(w.at_init(44100, 128)).toBe(0)
  })

  it('has a plausible port table', () => {
    const n = w.at_port_count()
    expect(n).toBeGreaterThan(20)
    let noteLike = 0
    for (let p = 0; p < n; p++) {
      if (w.at_port_is_control_input(p) && w.at_port_lower(p) === -1 && w.at_port_upper(p) === 1) {
        noteLike++
      }
    }
    expect(noteLike).toBeGreaterThanOrEqual(12)
  })

  it('processes a block without trapping', () => {
    const f32 = new Float32Array(w.memory.buffer)
    const inIdx = w.at_in_ptr() >> 2
    for (let i = 0; i < 128; i++) f32[inIdx + i] = Math.sin((2 * Math.PI * 440 * i) / 44100)
    w.at_process(128)
    expect(Number.isFinite(new Float32Array(w.memory.buffer)[w.at_out_ptr() >> 2])).toBe(true)
  })
})
```

- [ ] **Step 7: Run tests**

Run: `npm run test:unit`
Expected: PASS. If instantiate fails on a missing import namespace, add that namespace with the same Proxy stub in both the test and `scripts/dump-ports.mjs`.

- [ ] **Step 8: Commit (wasm binary included)**

```bash
git add native/autotalent scripts/dump-ports.mjs src/renderer/public/worklet/autotalent.wasm tests/unit/wasm.test.ts
git commit -m "feat: autotalent compiled to wasm with ladspa wrapper"
```

---

### Task 6: Port map + key/scale weights

**Files:**
- Create: `src/renderer/src/audio/autotune/portmap.ts`, `src/renderer/src/audio/autotune/scale.ts`
- Test: `tests/unit/portmap.test.ts`, `tests/unit/scale.test.ts`

**Interfaces:**
- Consumes: wasm exports from Task 5.
- Produces:
  - `buildPortMap(bytes: ArrayBuffer): Promise<PortMap>` with `interface PortMap { notes: number[]; concertA: number; amount: number; smooth: number; mix: number }` (port indices; `notes` is 12 indices in autotalent order, A first).
  - `scaleWeights(root: NoteName, mode: Mode): number[]` — 12 weights (1 allowed / -1 blocked) in the same A-first order; `type NoteName = 'A'|'Bb'|'B'|'C'|'Db'|'D'|'Eb'|'E'|'F'|'Gb'|'G'|'Ab'`; `type Mode = 'major'|'minor'|'chromatic'`.
  - `defaultControls(map: PortMap): Array<[number, number]>` — `[portIndex, value]` pairs: concertA 440, amount 1, smooth 0, mix 1.

- [ ] **Step 1: Write the failing tests**

`tests/unit/scale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scaleWeights, NOTE_ORDER } from '../../src/renderer/src/audio/autotune/scale'

describe('scaleWeights', () => {
  it('chromatic allows everything', () => {
    expect(scaleWeights('C', 'chromatic')).toEqual(Array(12).fill(1))
  })

  it('C major allows exactly C D E F G A B', () => {
    const w = scaleWeights('C', 'major')
    const allowed = NOTE_ORDER.filter((_, i) => w[i] === 1)
    expect(allowed.sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'].sort())
  })

  it('A minor equals C major pitch set', () => {
    expect(scaleWeights('A', 'minor')).toEqual(scaleWeights('C', 'major'))
  })
})
```

`tests/unit/portmap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { buildPortMap, defaultControls } from '../../src/renderer/src/audio/autotune/portmap'

describe('buildPortMap on the real wasm', () => {
  it('resolves all required ports', async () => {
    const bytes = (await readFile('src/renderer/public/worklet/autotalent.wasm')).buffer
    const map = await buildPortMap(bytes as ArrayBuffer)
    expect(map.notes).toHaveLength(12)
    expect(new Set([...map.notes, map.concertA, map.amount, map.smooth, map.mix]).size).toBe(16)
    const defaults = defaultControls(map)
    expect(defaults).toContainEqual([map.concertA, 440])
    expect(defaults).toContainEqual([map.mix, 1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement scale.ts**

`src/renderer/src/audio/autotune/scale.ts`:

```ts
export const NOTE_ORDER = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab'] as const
export type NoteName = (typeof NOTE_ORDER)[number]
export type Mode = 'major' | 'minor' | 'chromatic'

const INTERVALS: Record<Exclude<Mode, 'chromatic'>, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
}

export function scaleWeights(root: NoteName, mode: Mode): number[] {
  if (mode === 'chromatic') return Array(12).fill(1)
  const weights = Array(12).fill(-1)
  const rootIdx = NOTE_ORDER.indexOf(root)
  for (const interval of INTERVALS[mode]) {
    weights[(rootIdx + interval) % 12] = 1
  }
  return weights
}
```

- [ ] **Step 4: Implement portmap.ts**

`src/renderer/src/audio/autotune/portmap.ts`:

```ts
export interface PortMap {
  notes: number[]
  concertA: number
  amount: number
  smooth: number
  mix: number
}

const stub = (): Record<string, () => number> =>
  new Proxy({}, { get: () => () => 0 }) as Record<string, () => number>

export async function buildPortMap(bytes: ArrayBuffer): Promise<PortMap> {
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: stub(),
    wasi_snapshot_preview1: stub()
  })
  const w = instance.exports as Record<string, CallableFunction> & { memory: WebAssembly.Memory }
  if (w.at_init(44100, 128) !== 0) throw new Error('autotalent init failed')

  const name = (ptr: number): string => {
    const mem = new Uint8Array(w.memory.buffer)
    let end = ptr
    while (mem[end] !== 0) end++
    return new TextDecoder().decode(mem.subarray(ptr, end)).toLowerCase()
  }

  const n = w.at_port_count() as number
  const notes: number[] = []
  let concertA = -1
  let amount = -1
  let smooth = -1
  let mix = -1

  for (let p = 0; p < n; p++) {
    if (!w.at_port_is_control_input(p)) {
      if (notes.length > 0 && notes.length < 12) notes.length = 0
      continue
    }
    const isNoteRange = w.at_port_lower(p) === -1 && w.at_port_upper(p) === 1
    const nm = name(w.at_port_name(p) as number)
    if (isNoteRange && notes.length < 12 && !nm.includes('pull')) {
      notes.push(p)
      continue
    }
    if (notes.length > 0 && notes.length < 12) notes.length = 0
    if (nm.includes('concert')) concertA = p
    else if (nm.includes('strength') || nm.includes('amount')) amount = p
    else if (nm.includes('smooth')) smooth = p
    else if (nm.includes('mix')) mix = p
  }

  if (notes.length !== 12 || concertA < 0 || amount < 0 || smooth < 0 || mix < 0) {
    throw new Error('autotalent port map incomplete — compare with scripts/dump-ports.mjs output')
  }
  return { notes, concertA, amount, smooth, mix }
}

export function defaultControls(map: PortMap): Array<[number, number]> {
  return [
    [map.concertA, 440],
    [map.amount, 1],
    [map.smooth, 0],
    [map.mix, 1],
    ...map.notes.map((p): [number, number] => [p, 1])
  ]
}
```

- [ ] **Step 5: Run tests and calibrate**

Run: `npm run test:unit`
Expected: PASS. If `portmap.test.ts` fails with "port map incomplete", run `node scripts/dump-ports.mjs`, read the actual port names/ranges, and adjust the substring matches (or the consecutive-run detection) to fit reality. The dump output is ground truth; the test gate stays as written.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/audio/autotune tests/unit/portmap.test.ts tests/unit/scale.test.ts
git commit -m "feat: autotalent port map and key/scale weights"
```

---

### Task 7: AudioWorklet processor + engine integration

**Files:**
- Create: `src/renderer/public/worklet/autotalent-processor.js` (plain JS, served unbundled)
- Create: `src/renderer/src/audio/autotune/autotune-node.ts`
- Modify: `src/renderer/src/audio/engine.ts`, `src/renderer/src/harness.ts`
- Test: `tests/dsp/autotune.spec.ts`

**Interfaces:**
- Consumes: wasm (Task 5), `buildPortMap`/`defaultControls`/`scaleWeights` (Task 6), `buildChain` (Task 4).
- Produces:
  - `createAutotuneNode(ctx: BaseAudioContext): Promise<AutotuneHandle>` where `AutotuneHandle = { node: AudioWorkletNode; setControl(port: number, value: number): void; portMap: PortMap }`.
  - `AudioEngine` gains: `enableAutotune(): Promise<void>`, `disableAutotune(): void`, `setAutotuneStrength(v: number)`, `setAutotuneScale(root: NoteName, mode: Mode)`.

- [ ] **Step 1: Write the worklet processor**

`src/renderer/public/worklet/autotalent-processor.js`:

```js
const stub = () => new Proxy({}, { get: () => () => 0 })

class AutotalentProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.ready = false
    const { wasmBytes, controls } = options.processorOptions
    this.port.onmessage = (e) => {
      if (e.data.type !== 'set') return
      if (this.ready) this.wasm.at_set_control(e.data.port, e.data.value)
      else controls.push([e.data.port, e.data.value])
    }
    WebAssembly.instantiate(wasmBytes, { env: stub(), wasi_snapshot_preview1: stub() }).then(
      ({ instance }) => {
        this.wasm = instance.exports
        if (this.wasm.at_init(sampleRate, 128) !== 0) return
        this.inIdx = this.wasm.at_in_ptr() >> 2
        this.outIdx = this.wasm.at_out_ptr() >> 2
        for (const [p, v] of controls) this.wasm.at_set_control(p, v)
        this.ready = true
      }
    )
  }

  process(inputs, outputs) {
    const input = inputs[0][0]
    const outs = outputs[0]
    if (!input) return true
    if (!this.ready) {
      for (const o of outs) o.set(input)
      return true
    }
    const heap = new Float32Array(this.wasm.memory.buffer)
    heap.set(input, this.inIdx)
    this.wasm.at_process(input.length)
    const result = heap.subarray(this.outIdx, this.outIdx + input.length)
    for (const o of outs) o.set(result)
    return true
  }
}

registerProcessor('autotalent', AutotalentProcessor)
```

- [ ] **Step 2: Write the node factory**

`src/renderer/src/audio/autotune/autotune-node.ts`:

```ts
import { buildPortMap, defaultControls, type PortMap } from './portmap'

export interface AutotuneHandle {
  node: AudioWorkletNode
  portMap: PortMap
  setControl: (port: number, value: number) => void
}

export async function createAutotuneNode(ctx: BaseAudioContext): Promise<AutotuneHandle> {
  const bytes = await fetch('/worklet/autotalent.wasm').then((r) => r.arrayBuffer())
  const portMap = await buildPortMap(bytes.slice(0))
  await ctx.audioWorklet.addModule('/worklet/autotalent-processor.js')
  const node = new AudioWorkletNode(ctx, 'autotalent', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { wasmBytes: bytes, controls: defaultControls(portMap) }
  })
  return {
    node,
    portMap,
    setControl: (port, value) => node.port.postMessage({ type: 'set', port, value })
  }
}
```

- [ ] **Step 3: Integrate into AudioEngine**

In `src/renderer/src/audio/engine.ts`, change `buildChain` so the source-to-micGain hookup is re-wireable, and add autotune methods. Replace the `source.connect(micGain)` wiring with the source stored on the chain, and add to the `Chain` interface: `source: AudioNode`. Then extend `AudioEngine`:

```ts
import { createAutotuneNode, type AutotuneHandle } from './autotune/autotune-node'
import { scaleWeights, type NoteName, type Mode } from './autotune/scale'

// inside AudioEngine:
  private autotune: AutotuneHandle | null = null
  private root: NoteName = 'C'
  private mode: Mode = 'chromatic'

  async enableAutotune(): Promise<void> {
    if (!this.ctx || !this.chain || this.autotune) return
    this.autotune = await createAutotuneNode(this.ctx)
    this.chain.source.disconnect(this.chain.micGain)
    this.chain.source.connect(this.autotune.node)
    this.autotune.node.connect(this.chain.micGain)
    this.applyScale()
  }

  disableAutotune(): void {
    if (!this.chain || !this.autotune) return
    this.chain.source.disconnect(this.autotune.node)
    this.autotune.node.disconnect()
    this.chain.source.connect(this.chain.micGain)
    this.autotune = null
  }

  setAutotuneStrength(v: number): void {
    this.autotune?.setControl(this.autotune.portMap.amount, v)
  }

  setAutotuneScale(root: NoteName, mode: Mode): void {
    this.root = root
    this.mode = mode
    this.applyScale()
  }

  private applyScale(): void {
    if (!this.autotune) return
    const weights = scaleWeights(this.root, this.mode)
    weights.forEach((w, i) => this.autotune!.setControl(this.autotune!.portMap.notes[i], w))
  }
```

- [ ] **Step 4: Add the pitch-snap harness test**

Append to `src/renderer/src/harness.ts`:

```ts
import { createAutotuneNode } from './audio/autotune/autotune-node'

function estimateFreq(data: Float32Array, sampleRate: number, from: number): number {
  let crossings = 0
  let first = -1
  let last = -1
  for (let i = from + 1; i < data.length; i++) {
    if (data[i - 1] <= 0 && data[i] > 0) {
      if (first < 0) first = i
      last = i
      crossings++
    }
  }
  return ((crossings - 1) * sampleRate) / (last - first)
}

declare global {
  interface Window {
    testAutotuneSnap: () => Promise<{ inputHz: number; outputHz: number }>
  }
}

window.testAutotuneSnap = async () => {
  const sr = 44100
  const ctx = new OfflineAudioContext(1, sr * 2, sr)
  const osc = ctx.createOscillator()
  osc.frequency.value = 449
  const at = await createAutotuneNode(ctx)
  osc.connect(at.node)
  at.node.connect(ctx.destination)
  osc.start()
  const rendered = await ctx.startRendering()
  return { inputHz: 449, outputHz: estimateFreq(rendered.getChannelData(0), sr, sr) }
}
```

- [ ] **Step 5: Write the failing Playwright test**

`tests/dsp/autotune.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('autotune snaps a 449Hz tone toward A440', async ({ page }) => {
  await page.goto('/harness.html')
  const { outputHz } = (await page.evaluate('window.testAutotuneSnap()')) as { outputHz: number }
  expect(Math.abs(outputHz - 440)).toBeLessThan(Math.abs(outputHz - 449))
  expect(Math.abs(outputHz - 440)).toBeLessThan(4)
})
```

- [ ] **Step 6: Run DSP tests**

Run: `npm run test:dsp`
Expected: PASS (3 tests total). Debugging notes if it fails: worklet `fetch` of the wasm happens in `createAutotuneNode` (main thread) not the worklet, so 404s show in the page console — check `page.on('console')`; if output is silence, the wasm likely trapped in `at_init` (sampleRate mismatch is not possible offline — check the stub imports).

- [ ] **Step 7: Run all tests + build**

Run: `npm run test:unit && npm run test:dsp && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/public/worklet/autotalent-processor.js src/renderer/src/audio/autotune/autotune-node.ts src/renderer/src/audio/engine.ts src/renderer/src/harness.ts tests/dsp/autotune.spec.ts
git commit -m "feat: autotalent audioworklet integrated into mic chain"
```

---

### Task 8: Control bar UI

**Files:**
- Modify: `src/renderer/src/App.tsx` (replace template content entirely), `src/renderer/src/assets/main.css` (or template equivalent — replace with control bar styles)
- Delete: template demo components (`src/renderer/src/components/Versions.tsx` etc.)

**Interfaces:**
- Consumes: `AudioEngine` full API (Tasks 4 + 7), `NOTE_ORDER` from scale.ts.
- Produces: the complete v1 UI in the 96 px bottom strip.

- [ ] **Step 1: Implement the control bar**

`src/renderer/src/App.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { AudioEngine } from './audio/engine'
import { NOTE_ORDER, type NoteName, type Mode } from './audio/autotune/scale'

export default function App(): JSX.Element {
  const engine = useRef(new AudioEngine())
  const [micOn, setMicOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [gain, setGain] = useState(1)
  const [reverb, setReverb] = useState(0.35)
  const [autotune, setAutotune] = useState(false)
  const [autotuneError, setAutotuneError] = useState(false)
  const [root, setRoot] = useState<NoteName>('C')
  const [mode, setMode] = useState<Mode>('chromatic')
  const [strength, setStrength] = useState(1)

  const refreshDevices = async (): Promise<void> => {
    const all = await navigator.mediaDevices.enumerateDevices()
    setDevices(all.filter((d) => d.kind === 'audioinput'))
  }

  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [])

  const toggleMic = async (): Promise<void> => {
    if (micOn) {
      engine.current.stop()
      setMicOn(false)
      setAutotune(false)
      return
    }
    try {
      setMicError(null)
      await engine.current.start(deviceId || undefined)
      engine.current.setMicGain(gain)
      engine.current.setReverbMix(reverb)
      setMicOn(true)
      refreshDevices()
    } catch {
      setMicError('Mic access denied — allow it and retry')
    }
  }

  const toggleAutotune = async (): Promise<void> => {
    if (autotune) {
      engine.current.disableAutotune()
      setAutotune(false)
      return
    }
    try {
      await engine.current.enableAutotune()
      engine.current.setAutotuneStrength(strength)
      engine.current.setAutotuneScale(root, mode)
      setAutotune(true)
    } catch {
      setAutotuneError(true)
    }
  }

  return (
    <div className="bar">
      <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
      <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
        <option value="">Default mic</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || 'Microphone'}
          </option>
        ))}
      </select>
      <label>
        Gain
        <input type="range" min="0" max="2" step="0.01" value={gain}
          onChange={(e) => { setGain(+e.target.value); engine.current.setMicGain(+e.target.value) }} />
      </label>
      <label>
        Reverb
        <input type="range" min="0" max="1" step="0.01" value={reverb}
          onChange={(e) => { setReverb(+e.target.value); engine.current.setReverbMix(+e.target.value) }} />
      </label>
      <button onClick={toggleAutotune} disabled={!micOn || autotuneError}
        title={autotuneError ? 'Autotune failed to load' : ''}>
        {autotune ? 'Autotune On' : 'Autotune Off'}
      </button>
      <select value={mode} disabled={!autotune}
        onChange={(e) => { const m = e.target.value as Mode; setMode(m); engine.current.setAutotuneScale(root, m) }}>
        <option value="chromatic">Chromatic</option>
        <option value="major">Major</option>
        <option value="minor">Minor</option>
      </select>
      <select value={root} disabled={!autotune || mode === 'chromatic'}
        onChange={(e) => { const r = e.target.value as NoteName; setRoot(r); engine.current.setAutotuneScale(r, mode) }}>
        {NOTE_ORDER.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <label>
        Strength
        <input type="range" min="0" max="1" step="0.01" value={strength} disabled={!autotune}
          onChange={(e) => { setStrength(+e.target.value); engine.current.setAutotuneStrength(+e.target.value) }} />
      </label>
      {micOn && <span className="warn">🎧 Use headphones — speakers will feed back</span>}
      {micError && <span className="error">{micError}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Style the bar**

Replace the template's main CSS with:

```css
* { margin: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #111; color: #eee; }
.bar {
  position: fixed; bottom: 0; left: 0; right: 0; height: 96px;
  display: flex; align-items: center; gap: 12px; padding: 0 16px;
  background: #111;
}
.bar label { display: flex; flex-direction: column; font-size: 11px; gap: 2px; }
.warn { color: #fc0; font-size: 12px; }
.error { color: #f66; font-size: 12px; }
```

Remove template demo components and their imports so the renderer shows only the bar.

- [ ] **Step 3: Verify build and tests**

Run: `npm run build && npm run test:unit && npm run test:dsp`
Expected: all pass (UI has no unit tests; logic it calls is already covered).

- [ ] **Step 4: Manual smoke test**

`npm run dev` (WSLg or Windows): mic toggles on with permission prompt handled silently (main process grants `media`), gain/reverb sliders audibly change monitoring, autotune toggle audibly snaps pitch, headphone warning shows while mic is on, denied-permission path shows the retry message (test by revoking mic in OS settings).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: control bar ui wired to audio engine"
```

---

### Task 9: Windows packaging + release checklist

**Files:**
- Modify: `electron-builder.yml` (template-provided) — set `productName: Karaoke`, appId `com.dobby.karaoke`; confirm `src/renderer/public/**` lands in the packaged renderer output (electron-vite copies `public/` into `out/renderer` automatically — verify, don't assume).

**Interfaces:**
- Consumes: everything.
- Produces: installable Windows build.

- [ ] **Step 1: Verify packaged renderer includes worklet assets**

Run: `npm run build && ls out/renderer/worklet/`
Expected: `autotalent.wasm` and `autotalent-processor.js` present. If missing, add to `electron.vite.config.ts` renderer config: `publicDir: 'public'` (relative to `src/renderer`).

- [ ] **Step 2: Build Windows installer (run on Windows)**

On the Windows side (clone the repo there — don't build the installer across the WSL boundary):

```powershell
npm install
npm run build:win
```

Expected: `dist/karaoke-*-setup.exe` produced.

- [ ] **Step 3: Manual release checklist (on Windows, with headphones)**

- App opens; YouTube loads and plays a karaoke video.
- Google sign-in works; still signed in after relaunch; Premium account sees no ads.
- Mic on: voice monitored with reverb; latency is singable.
- Reverb slider 0 → dry voice; 1 → cathedral.
- Autotune chromatic + strength 1 on a held note: audible snap.
- Autotune major key C: singing scale notes passes through, off-scale notes pull.
- Unplugging the selected mic then toggling mic off/on recovers on default device.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml electron.vite.config.ts
git commit -m "feat: windows packaging config"
```
