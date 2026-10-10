import type { OcularOffset } from "./ocular-axes.types"

/** Restore canthus-local offsets to camera axes. This does not estimate ocular torsion. */
export function restoreOcularAxes(
  offset: OcularOffset,
  rollRadians: number
): OcularOffset | null {
  if (![offset.x, offset.y, rollRadians].every(Number.isFinite)) {
    return null
  }
  const cosine = Math.cos(rollRadians)
  const sine = Math.sin(rollRadians)
  return {
    x: cosine * offset.x - sine * offset.y,
    y: sine * offset.x + cosine * offset.y,
  }
}
