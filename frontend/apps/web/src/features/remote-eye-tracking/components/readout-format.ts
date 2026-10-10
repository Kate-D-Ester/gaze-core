import type { RemoteObservation } from "../remote-eye-tracking.types"

export function degrees(value: number | null) {
  return value === null ? "—" : `${Math.round((value * 180) / Math.PI)}°`
}
export function percentage(value: number | undefined, precision = 0) {
  return value === undefined ? "—" : `${(value * 100).toFixed(precision)}%`
}

/** Timing uses real source frames; display smoothing never contributes to FPS. */
export function remotePerformanceText(observation: RemoteObservation | null) {
  if (!observation) {
    return "Waiting for a processed camera frame"
  }
  const timing = observation.timing
  const stages = [
    ["Capture", timing?.captureMs],
    ["Face", timing?.landmarksMs],
    ["Readback", timing?.readbackMs],
    ["Eye patch", timing?.eyePatchMs],
    ["Geometry", timing?.geometryMs],
    ["Appearance", timing?.appearanceMs],
    ["Total latency", timing?.endToEndMs],
  ] as const
  const lines = [observation.method]
  for (const [label, milliseconds] of stages) {
    if (milliseconds !== undefined && Number.isFinite(milliseconds)) {
      lines.push(`${label}: ${milliseconds.toFixed(0)} ms`)
    }
  }
  if (timing?.readbackPixels !== undefined) {
    const framePixels = observation.width * observation.height
    const portion = timing.readbackPixels / framePixels
    if (Number.isFinite(portion)) {
      lines.push(`Pixels read: ${(portion * 100).toFixed(1)}% of frame`)
    }
  }
  return lines.join(" · ")
}
