import { net } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import extractZip from 'extract-zip'
import { SHELL_API_VERSION } from './shell-api'

const RELEASES_URL = 'https://api.github.com/repos/wjin17/campfire/releases/latest'
const PAYLOAD_ZIP_RE = /^payload-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?\.zip$/

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface ReleaseJson {
  assets?: ReleaseAsset[]
}

export interface PayloadAssets {
  zipUrl: string
  manifestUrl: string
}

export interface PayloadManifest {
  version: string
  sha256: string
  minShellApi: number
}

export interface CurrentPayload {
  version: string
  dir: string
  previous?: { version: string; dir: string }
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .split('-')[0]
      .split('.')
      .map((n) => Number(n) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

export function pickPayloadAssets(release: ReleaseJson): PayloadAssets | null {
  const assets = release.assets ?? []
  const zip = assets.find((a) => PAYLOAD_ZIP_RE.test(a.name))
  const manifest = assets.find((a) => a.name === 'payload.json')
  if (!zip || !manifest) return null
  return { zipUrl: zip.browser_download_url, manifestUrl: manifest.browser_download_url }
}

export function validateManifest(m: unknown): m is PayloadManifest {
  if (typeof m !== 'object' || m === null) return false
  const r = m as Record<string, unknown>
  if (typeof r.version !== 'string') return false
  if (typeof r.sha256 !== 'string') return false
  if (typeof r.minShellApi !== 'number') return false
  return r.minShellApi <= SHELL_API_VERSION
}

function currentJsonPath(userDataDir: string): string {
  return join(userDataDir, 'payloads', 'current.json')
}

function dirHasIndex(dir: string): boolean {
  return existsSync(join(dir, 'index.html'))
}

function readCurrentPayload(userDataDir: string): CurrentPayload | null {
  try {
    const raw = JSON.parse(
      readFileSync(currentJsonPath(userDataDir), 'utf-8')
    ) as Partial<CurrentPayload>
    if (typeof raw.version !== 'string' || typeof raw.dir !== 'string') return null
    return raw as CurrentPayload
  } catch {
    return null
  }
}

export function resolveActivePayload(
  userDataDir: string,
  bundledDir: string,
  bundledVersion: string
): { dir: string; version: string } {
  const current = readCurrentPayload(userDataDir)
  if (current) {
    if (dirHasIndex(current.dir)) return { dir: current.dir, version: current.version }
    if (current.previous && dirHasIndex(current.previous.dir)) {
      return { dir: current.previous.dir, version: current.previous.version }
    }
  }
  return { dir: bundledDir, version: bundledVersion }
}

export async function checkForPayloadUpdate(userDataDir: string): Promise<void> {
  try {
    const releaseRes = await net.fetch(RELEASES_URL)
    if (!releaseRes.ok) return
    const release = (await releaseRes.json()) as ReleaseJson
    const picked = pickPayloadAssets(release)
    if (!picked) return

    const manifestRes = await net.fetch(picked.manifestUrl)
    if (!manifestRes.ok) return
    const manifest: unknown = await manifestRes.json()
    if (!validateManifest(manifest)) return

    const current = readCurrentPayload(userDataDir)
    if (current && compareSemver(manifest.version, current.version) <= 0) return

    const zipRes = await net.fetch(picked.zipUrl)
    if (!zipRes.ok) return
    const zipBuf = Buffer.from(await zipRes.arrayBuffer())

    const sha256 = createHash('sha256').update(zipBuf).digest('hex')
    if (sha256 !== manifest.sha256) return

    const payloadsDir = join(userDataDir, 'payloads')
    mkdirSync(payloadsDir, { recursive: true })
    const tempZipPath = join(payloadsDir, `${manifest.version}.zip.tmp`)
    writeFileSync(tempZipPath, zipBuf)

    const targetDir = join(payloadsDir, manifest.version)
    try {
      await extractZip(tempZipPath, { dir: targetDir })
    } finally {
      rmSync(tempZipPath, { force: true })
    }

    const next: CurrentPayload = {
      version: manifest.version,
      dir: targetDir,
      ...(current ? { previous: { version: current.version, dir: current.dir } } : {})
    }
    writeFileSync(currentJsonPath(userDataDir), JSON.stringify(next, null, 2))
  } catch (err) {
    console.error('payload update check failed', err)
  }
}
