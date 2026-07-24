import { describe, it, expect } from 'vitest'
import { parseLrc } from '../../src/renderer/src/lyrics/lrc'

describe('parseLrc', () => {
  it('parses one timestamp per line', () => {
    const text = '[00:01.00]First line\n[00:05.50]Second line'
    expect(parseLrc(text)).toEqual([
      { t: 1, text: 'First line' },
      { t: 5.5, text: 'Second line' }
    ])
  })

  it('handles multiple timestamps sharing one line of text', () => {
    const text = '[01:10.00][02:20.00]Chorus'
    expect(parseLrc(text)).toEqual([
      { t: 70, text: 'Chorus' },
      { t: 140, text: 'Chorus' }
    ])
  })

  it('ignores metadata tags', () => {
    const text = '[ar:Some Artist]\n[ti:Some Title]\n[00:00.00]Line one'
    expect(parseLrc(text)).toEqual([{ t: 0, text: 'Line one' }])
  })

  it('sorts lines out of file order by timestamp', () => {
    const text = '[00:10.00]Later\n[00:02.00]Earlier'
    expect(parseLrc(text)).toEqual([
      { t: 2, text: 'Earlier' },
      { t: 10, text: 'Later' }
    ])
  })

  it('handles a timestamp with no centiseconds', () => {
    expect(parseLrc('[00:12]No centiseconds')).toEqual([{ t: 12, text: 'No centiseconds' }])
  })

  it('drops empty/tagless lines', () => {
    const text = '\n[00:01.00]Line\n\n'
    expect(parseLrc(text)).toEqual([{ t: 1, text: 'Line' }])
  })
})
