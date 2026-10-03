import type { GazeBubbleOverlaySnapshot } from "../gaze-bubble/gaze-bubble-overlay.types"
import type { GazeMeasurement } from "../scene-eye-tracking/scene.types"
import type { Box, FaceTrack } from "./client.types"
import type { SelectionBubble } from "./bubble-selection.types"
import { verifiedGazePoint } from "./gaze-evidence"
import { boxAtTime } from "./face-geometry"

const AREA_TOLERANCE = 1e-6

export function visibleSelectionBubble(
  snapshot: GazeBubbleOverlaySnapshot | null,
  measurement: GazeMeasurement | null,
  verified: boolean,
  now: number
): SelectionBubble | null {
  const point = verifiedGazePoint(measurement, now)
  if (
    !verified ||
    !point ||
    !snapshot?.bubble.verified ||
    snapshot.bubble.rawPoint.some((value, index) => value !== point[index]) ||
    !measurement
  ) {
    return null
  }
  const { bubble, view } = snapshot
  if (
    ![view.width, view.height, bubble.radiusPx].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return null
  }
  return {
    center: bubble.center,
    radius: [bubble.radiusPx / view.width, bubble.radiusPx / view.height],
    timestamp: measurement.timestamp,
  }
}

function arcIntegral(value: number): number {
  return (
    (value * Math.sqrt(Math.max(0, 1 - value * value)) + Math.asin(value)) / 2
  )
}
/** Signed integral over the rectangle from the unit circle's origin to (x,y). */
function circlePrimitive(x: number, y: number): number {
  const width = Math.min(1, Math.abs(x))
  const height = Math.min(1, Math.abs(y))
  const cutoff = Math.min(width, Math.sqrt(Math.max(0, 1 - height * height)))
  const area = height * cutoff + arcIntegral(width) - arcIntegral(cutoff)
  return Math.sign(x) * Math.sign(y) * area
}
function coveredArea(box: Box, bubble: SelectionBubble): number {
  if (!box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
    return 0
  }
  const left = (box[0] - bubble.center[0]) / bubble.radius[0]
  const right = (box[0] + box[2] - bubble.center[0]) / bubble.radius[0]
  const top = (box[1] - bubble.center[1]) / bubble.radius[1]
  const bottom = (box[1] + box[3] - bubble.center[1]) / bubble.radius[1]
  return (
    Math.max(
      0,
      circlePrimitive(right, bottom) -
        circlePrimitive(left, bottom) -
        circlePrimitive(right, top) +
        circlePrimitive(left, top)
    ) / Math.PI
  )
}

/** Largest face/circle intersection wins. Equal coverage keeps the current lock. */
export function selectByBubble(
  tracks: readonly FaceTrack[],
  bubble: SelectionBubble,
  timestamp: number,
  preferredId: string | null = null
): string | null {
  if (
    ![...bubble.center, ...bubble.radius, bubble.timestamp, timestamp].every(
      Number.isFinite
    ) ||
    bubble.center.some((value) => value < 0 || value > 1) ||
    bubble.radius.some((value) => value <= 0 || value > 1)
  ) {
    return null
  }
  const overlaps = tracks.flatMap((track) => {
    const box = boxAtTime(track, timestamp)
    return box ? [{ id: track.id, area: coveredArea(box, bubble) }] : []
  })
  const largest = Math.max(0, ...overlaps.map((item) => item.area))
  if (largest <= AREA_TOLERANCE) {
    return null
  }
  const winners = overlaps
    .filter((item) => Math.abs(item.area - largest) <= AREA_TOLERANCE)
    .map((item) => item.id)
  if (preferredId && winners.includes(preferredId)) {
    return preferredId
  }
  return winners.length === 1 ? winners[0]! : null
}
