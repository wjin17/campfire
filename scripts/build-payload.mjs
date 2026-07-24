import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import archiver from 'archiver'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version

const shellApiSrc = readFileSync('src/main/shell-api.ts', 'utf-8')
const shellApiMatch = shellApiSrc.match(/SHELL_API_VERSION\s*=\s*(\d+)/)
if (!shellApiMatch) throw new Error('could not find SHELL_API_VERSION in src/main/shell-api.ts')
const minShellApi = Number(shellApiMatch[1])

execSync('npm run build', { stdio: 'inherit' })

mkdirSync('dist', { recursive: true })
const zipPath = join('dist', `payload-${version}.zip`)

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  output.on('close', resolve)
  archive.on('error', reject)
  archive.pipe(output)
  archive.directory('out/renderer', false)
  archive.finalize()
})

const zipBuf = await readFile(zipPath)
const sha256 = createHash('sha256').update(zipBuf).digest('hex')

const manifest = { version, sha256, minShellApi }
writeFileSync(join('dist', 'payload.json'), JSON.stringify(manifest, null, 2))

console.log(`built ${zipPath}`)
console.log(JSON.stringify(manifest, null, 2))
