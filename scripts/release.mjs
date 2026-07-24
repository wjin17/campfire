import { execSync, spawn } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { zipDir } from './zip-dir.mjs'

const REPO = 'wjin17/campfire'
const API = 'https://api.github.com'

export function githubToken() {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['credential', 'fill'])
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.stderr.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git credential fill exited ${code}: ${err.trim()}`))
        return
      }
      const match = out.match(/^password=(.*)$/m)
      if (!match) {
        reject(new Error('git credential fill returned no password'))
        return
      }
      resolve(match[1].trim())
    })
    proc.stdin.write('protocol=https\nhost=github.com\n\n')
    proc.stdin.end()
  })
}

export async function ensurePages(token) {
  const res = await fetch(`${API}/repos/${REPO}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ source: { branch: 'master', path: '/docs' } })
  })
  if (res.ok || res.status === 409) return
  const body = await res.text().catch(() => '')
  if (/already (has|enabled)/i.test(body)) return
  throw new Error(`ensurePages failed: ${res.status} ${body}`)
}

async function createRelease(token, tag) {
  const res = await fetch(`${API}/repos/${REPO}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ tag_name: tag, name: tag })
  })
  if (!res.ok) throw new Error(`createRelease failed: ${res.status} ${await res.text()}`)
  return res.json()
}

function contentTypeFor(name) {
  return name.endsWith('.json') ? 'application/json' : 'application/zip'
}

async function uploadAsset(token, release, filePath) {
  const name = basename(filePath)
  const data = await readFile(filePath)
  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(name)}`)
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': contentTypeFor(name),
      'Content-Length': String(data.length)
    },
    body: data
  })
  if (!res.ok) throw new Error(`uploadAsset(${name}) failed: ${res.status} ${await res.text()}`)
}

function findWinUnpackedDir() {
  const entries = readdirSync('dist', { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^win.*-unpacked$/.test(e.name))
    .map((e) => join('dist', e.name))
  if (entries.length === 0) throw new Error('no win-unpacked directory found under dist/')
  entries.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return entries[0]
}

function findMacUnpackedDir() {
  const entries = readdirSync('dist', { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^mac/.test(e.name))
    .map((e) => join('dist', e.name))
  if (entries.length === 0) throw new Error('no mac-unpacked directory found under dist/')
  entries.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return entries[0]
}

const EXTENSION_EXTRA = [{ src: 'extension', dest: 'extension' }]

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const payloadOnly = args.includes('--payload-only')

  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  const version = pkg.version
  const tag = `v${version}`

  console.log(
    `release: campfire ${tag}${dryRun ? ' (dry run)' : ''}${payloadOnly ? ' (payload only)' : ''}`
  )

  execSync('node scripts/build-payload.mjs', { stdio: 'inherit' })
  const assets = [join('dist', `payload-${version}.zip`), join('dist', 'payload.json')]

  if (!payloadOnly) {
    execSync('npx electron-builder --win dir --config.win.signAndEditExecutable=false', {
      stdio: 'inherit'
    })
    const winDir = findWinUnpackedDir()
    const winZip = join('dist', 'Campfire-windows.zip')
    await zipDir(winDir, winZip, EXTENSION_EXTRA)
    assets.push(winZip)

    // `dir` (not `zip`) so we control the zip contents ourselves and can add
    // extension/ alongside Campfire.app, same as the Windows zip above.
    execSync('npx electron-builder --mac dir --arm64 --config.mac.identity=null', {
      stdio: 'inherit'
    })
    const macDir = findMacUnpackedDir()
    const macZip = join('dist', 'Campfire-mac-arm64.zip')
    await zipDir(macDir, macZip, EXTENSION_EXTRA)
    assets.push(macZip)
  }

  if (dryRun) {
    console.log('dry run — would upload:')
    for (const a of assets) console.log(`  ${a}`)
    return
  }

  const token = await githubToken()
  await ensurePages(token)
  const release = await createRelease(token, tag)
  for (const a of assets) await uploadAsset(token, release, a)
  console.log(`published ${tag}: ${assets.map((a) => basename(a)).join(', ')}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
