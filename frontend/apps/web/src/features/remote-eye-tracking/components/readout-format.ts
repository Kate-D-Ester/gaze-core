export function degrees(value: number | null) {
  return value === null ? "—" : `${Math.round((value * 180) / Math.PI)}°`
}
export function percentage(value: number | undefined, precision = 0) {
  return value === undefined ? "—" : `${(value * 100).toFixed(precision)}%`
}
