export interface LrcLine {
  t: number
  text: string
}

const TIME_TAG_RE = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g

export function parseLrc(text: string): LrcLine[] {
  const lines: LrcLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(TIME_TAG_RE)]
    if (tags.length === 0) continue
    const content = raw.replace(TIME_TAG_RE, '').trim()
    for (const tag of tags) {
      const t = Number(tag[1]) * 60 + Number(tag[2])
      lines.push({ t, text: content })
    }
  }
  return lines.sort((a, b) => a.t - b.t)
}
