export interface NowPlaying {
  source: 'extension' | 'smtc'
  title: string
  artist: string
  position: number
  duration: number
  playing: boolean
  ts: number
}
