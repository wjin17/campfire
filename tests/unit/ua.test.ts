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
