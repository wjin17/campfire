import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import archiver from 'archiver'

export function zipDir(srcDir, destZipPath, extraDirs = []) {
  mkdirSync(dirname(destZipPath), { recursive: true })
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destZipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve(destZipPath))
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(srcDir, false)
    for (const { src, dest } of extraDirs) archive.directory(src, dest)
    archive.finalize()
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [srcDir, destZipPath] = process.argv.slice(2)
  if (!srcDir || !destZipPath) {
    console.error('usage: node scripts/zip-dir.mjs <srcDir> <destZipPath>')
    process.exit(1)
  }
  await zipDir(srcDir, destZipPath)
  console.log(`zipped ${srcDir} -> ${destZipPath}`)
}
