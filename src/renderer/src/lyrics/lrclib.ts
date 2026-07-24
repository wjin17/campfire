export const DEFAULT_LRCLIB_BASE = 'https://lrclib.net'

let lrclibBase = DEFAULT_LRCLIB_BASE

export function setLrclibBase(base: string): void {
  lrclibBase = base
}

export interface LrclibTrack {
  trackName: string
  artistName: string
  duration: number
  syncedLyrics: string | null
}

const DURATION_BONUS = 0.15
const DURATION_WINDOW_S = 5

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchScore(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na && !nb) return 1
  if (!na || !nb) return 0
  if (na === nb) return 1
  const wordsA = na.split(' ')
  const wordsB = nb.split(' ')
  const setB = new Set(wordsB)
  let overlap = 0
  for (const w of wordsA) if (setB.has(w)) overlap++
  return (2 * overlap) / (wordsA.length + wordsB.length)
}

export function pickBestMatch(
  results: LrclibTrack[],
  title: string,
  artist: string,
  duration?: number
): LrclibTrack | null {
  const query = `${title} ${artist}`.trim()
  let best: LrclibTrack | null = null
  let bestScore = -Infinity
  for (const r of results) {
    if (!r.syncedLyrics) continue
    let score = matchScore(query, `${r.trackName} ${r.artistName}`.trim())
    if (duration !== undefined && Math.abs(r.duration - duration) <= DURATION_WINDOW_S) {
      score += DURATION_BONUS
    }
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  return best
}

const cache = new Map<string, string | null>()

async function fetchResults(url: string): Promise<LrclibTrack[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    return (await res.json()) as LrclibTrack[]
  } catch {
    return []
  }
}

export async function searchLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<string | null> {
  const key = `${title}|${artist}`
  if (cache.has(key)) return cache.get(key) ?? null

  const params = new URLSearchParams()
  if (title) params.set('track_name', title)
  if (artist) params.set('artist_name', artist)

  let results = await fetchResults(`${lrclibBase}/api/search?${params.toString()}`)
  if (results.length === 0) {
    const q = new URLSearchParams({ q: `${title} ${artist}`.trim() })
    results = await fetchResults(`${lrclibBase}/api/search?${q.toString()}`)
  }

  const best = pickBestMatch(results, title, artist, duration)
  const lyrics = best?.syncedLyrics ?? null
  cache.set(key, lyrics)
  return lyrics
}
