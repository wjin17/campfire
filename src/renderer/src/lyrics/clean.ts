export interface CleanedTitle {
  title: string
  artist?: string
}

const NOISE_WORDS = /official|video|audio|lyrics?|karaoke|hd|4k|remaster|mv|visualizer/i
// allows one level of nested (...)/[...] inside the outer group, e.g. "[Official Video (HD)]"
const BRACKET_RE = /[([]((?:[^()[\]]|\([^()]*\)|\[[^[\]]*\])*)[)\]]/g
const FEAT_BRACKET_RE = /[([]\s*(?:feat\.?|ft\.?)\s+[^()[\]]*[)\]]/gi
const FEAT_BARE_RE = /(?:feat\.?|ft\.?)\s+[^()[\]]*/gi
const YOUTUBE_SUFFIX_RE = /\s*[-–]\s*YouTube\s*$/i
const ARTIST_SEP_RE = /\s[-–—]\s/

function stripNoiseBrackets(s: string): string {
  return s.replace(BRACKET_RE, (whole, inner: string) => (NOISE_WORDS.test(inner) ? '' : whole))
}

export function cleanTitle(raw: string): CleanedTitle {
  let s = raw
  s = stripNoiseBrackets(s)
  s = s.replace(FEAT_BRACKET_RE, '')
  s = s.replace(FEAT_BARE_RE, '')
  s = s.replace(YOUTUBE_SUFFIX_RE, '')
  s = s.replace(/\s{2,}/g, ' ').trim()

  const sep = ARTIST_SEP_RE.exec(s)
  if (sep) {
    const artist = s.slice(0, sep.index).trim()
    const title = s.slice(sep.index + sep[0].length).trim()
    if (artist && title) return { title, artist }
  }
  return { title: s }
}
