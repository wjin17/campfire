import { describe, it, expect } from 'vitest'
import { cleanTitle } from '../../src/renderer/src/lyrics/clean'

describe('cleanTitle', () => {
  it('splits artist/title and strips noise brackets', () => {
    expect(cleanTitle('Artist - Song (Official Video) [4K]')).toEqual({
      title: 'Song',
      artist: 'Artist'
    })
  })

  it('strips a (Lyrics) tag and a bare feat. clause with no artist split', () => {
    expect(cleanTitle('Song (Lyrics) ft. X')).toEqual({ title: 'Song' })
  })

  it('leaves a plain title with no artist untouched', () => {
    expect(cleanTitle('Just A Plain Title')).toEqual({ title: 'Just A Plain Title' })
  })

  it('strips a trailing YouTube suffix after splitting artist/title', () => {
    expect(
      cleanTitle('Rick Astley - Never Gonna Give You Up (Official Music Video) - YouTube')
    ).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' })
  })

  it('strips a parenthesized feat. clause', () => {
    expect(cleanTitle('Post Malone - Sunflower (feat. Swae Lee) [Official Audio]')).toEqual({
      title: 'Sunflower',
      artist: 'Post Malone'
    })
  })

  it('strips a [Visualizer] tag with no artist present', () => {
    expect(cleanTitle('Some Song [Visualizer]')).toEqual({ title: 'Some Song' })
  })

  it('splits a plain Artist - Title with no noise tags', () => {
    expect(cleanTitle('Adele - Someone Like You')).toEqual({
      title: 'Someone Like You',
      artist: 'Adele'
    })
  })

  it('strips multiple noise brackets in one title', () => {
    expect(cleanTitle('Artist - Track Name (Karaoke Version) (HD)')).toEqual({
      title: 'Track Name',
      artist: 'Artist'
    })
  })

  it('matches "remaster" against "Remastered"', () => {
    expect(cleanTitle('Song Title (Remastered 2011)')).toEqual({ title: 'Song Title' })
  })

  it('keeps a non-noise parenthetical like (Live at Wembley)', () => {
    expect(cleanTitle('Artist Name - Song (Live at Wembley)')).toEqual({
      title: 'Song (Live at Wembley)',
      artist: 'Artist Name'
    })
  })

  it('strips a multi-artist feat. clause without garbling the trailing bracket content', () => {
    expect(cleanTitle('Song (feat. A, B & C)')).toEqual({ title: 'Song' })
  })

  it('splits artist/title on an en dash', () => {
    expect(cleanTitle('Artist – Song (Official Video)')).toEqual({
      title: 'Song',
      artist: 'Artist'
    })
  })

  it('splits artist/title on an em dash', () => {
    expect(cleanTitle('Artist — Song')).toEqual({ title: 'Song', artist: 'Artist' })
  })

  it('strips one level of nested brackets when the outer group is noise', () => {
    expect(cleanTitle('Song [Official Video (HD)]')).toEqual({ title: 'Song' })
  })
})
