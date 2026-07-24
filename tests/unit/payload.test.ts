import { describe, it, expect } from 'vitest'
import { compareSemver, pickPayloadAssets, validateManifest } from '../../src/main/payload'

describe('compareSemver', () => {
  it('reports equal versions as 0', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
  })

  it('reports a lower major version as -1', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
  })

  it('reports a higher major version as 1', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
  })

  it('compares minor versions when major matches', () => {
    expect(compareSemver('1.3.0', '1.2.9')).toBe(1)
  })

  it('compares patch versions when major/minor match', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1)
    expect(compareSemver('1.2.2', '1.2.3')).toBe(-1)
  })

  it('ignores prerelease suffixes when comparing', () => {
    expect(compareSemver('1.2.3-beta.1', '1.2.3')).toBe(0)
  })

  it('compares numerically, not lexicographically', () => {
    expect(compareSemver('10.0.0', '9.0.0')).toBe(1)
  })
})

describe('pickPayloadAssets', () => {
  it('finds the payload zip and manifest assets', () => {
    const release = {
      assets: [
        { name: 'payload-1.2.3.zip', browser_download_url: 'https://example.com/zip' },
        { name: 'payload.json', browser_download_url: 'https://example.com/manifest' },
        { name: 'Campfire-windows.zip', browser_download_url: 'https://example.com/win' }
      ]
    }
    expect(pickPayloadAssets(release)).toEqual({
      zipUrl: 'https://example.com/zip',
      manifestUrl: 'https://example.com/manifest'
    })
  })

  it('returns null when the payload zip is missing', () => {
    const release = { assets: [{ name: 'payload.json', browser_download_url: 'x' }] }
    expect(pickPayloadAssets(release)).toBeNull()
  })

  it('returns null when the manifest is missing', () => {
    const release = { assets: [{ name: 'payload-1.2.3.zip', browser_download_url: 'x' }] }
    expect(pickPayloadAssets(release)).toBeNull()
  })

  it('returns null when there are no assets', () => {
    expect(pickPayloadAssets({})).toBeNull()
  })
})

describe('validateManifest', () => {
  it('accepts a well-formed manifest with minShellApi <= SHELL_API_VERSION', () => {
    expect(validateManifest({ version: '1.2.3', sha256: 'abc', minShellApi: 1 })).toBe(true)
  })

  it('rejects a manifest with minShellApi greater than SHELL_API_VERSION', () => {
    expect(validateManifest({ version: '1.2.3', sha256: 'abc', minShellApi: 2 })).toBe(false)
  })

  it('rejects a non-string version', () => {
    expect(validateManifest({ version: 1, sha256: 'abc', minShellApi: 1 })).toBe(false)
  })

  it('rejects a non-string sha256', () => {
    expect(validateManifest({ version: '1.2.3', sha256: 123, minShellApi: 1 })).toBe(false)
  })

  it('rejects a non-number minShellApi', () => {
    expect(validateManifest({ version: '1.2.3', sha256: 'abc', minShellApi: '1' })).toBe(false)
  })

  it('rejects null and non-objects', () => {
    expect(validateManifest(null)).toBe(false)
    expect(validateManifest('nope')).toBe(false)
  })
})
