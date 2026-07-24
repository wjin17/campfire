import { NOTE_ORDER, type NoteName } from './autotune/scale'

export const CONFIDENCE_THRESHOLD = 0.5

export function semitonesToNote(st: number): { note: NoteName; cents: number } {
  const rounded = Math.round(st)
  const cents = Math.round((st - rounded) * 100)
  const idx = ((rounded % 12) + 12) % 12
  return { note: NOTE_ORDER[idx], cents }
}
