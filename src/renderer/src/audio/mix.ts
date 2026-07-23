export function mixGains(mix: number): { dry: number; wet: number } {
  const m = Math.min(1, Math.max(0, mix))
  return { dry: Math.cos((m * Math.PI) / 2), wet: Math.sin((m * Math.PI) / 2) }
}
