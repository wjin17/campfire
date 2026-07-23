export const NOTE_ORDER = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab'] as const
export type NoteName = (typeof NOTE_ORDER)[number]
export type Mode = 'major' | 'minor' | 'chromatic'

const INTERVALS: Record<Exclude<Mode, 'chromatic'>, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
}

export function scaleWeights(root: NoteName, mode: Mode): number[] {
  if (mode === 'chromatic') return Array(12).fill(1)
  const weights = Array(12).fill(-1)
  const rootIdx = NOTE_ORDER.indexOf(root)
  for (const interval of INTERVALS[mode]) {
    weights[(rootIdx + interval) % 12] = 1
  }
  return weights
}
