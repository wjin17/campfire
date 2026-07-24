export interface CleanedTitle {
  title: string
  artist?: string
}

const NOISE_WORDS = /official|video|audio|lyrics?|karaoke|hd|4k|remaster|mv|visualizer/i
const BRACKET_RE = /[([]([^()[\]]*)[)\]]/g
const FEAT_RE = /[([]?\s*(?:feat\.?|ft\.?)\s+[^()[\],-]*[)\]]?/gi
const YOUTUBE_SUFFIX_RE = /\s*[-–]\s*YouTube\s*$/i

function stripNoiseBrackets(s: string): string {
  return s.replace(BRACKET_RE, (whole, inner: string) => (NOISE_WORDS.test(inner) ? '' : whole))
}

export function cleanTitle(raw: string): CleanedTitle {
  let s = raw
  s = stripNoiseBrackets(s)
  s = s.replace(FEAT_RE, '')
  s = s.replace(YOUTUBE_SUFFIX_RE, '')
  s = s.replace(/\s{2,}/g, ' ').trim()

  const sepIdx = s.indexOf(' - ')
  if (sepIdx !== -1) {
    const artist = s.slice(0, sepIdx).trim()
    const title = s.slice(sepIdx + 3).trim()
    if (artist && title) return { title, artist }
  }
  return { title: s }
}
