export function toChromeUA(ua: string): string {
  return ua
    .replace(/\skaraoke\/\S+/i, '')
    .replace(/\sElectron\/\S+/, '')
}
