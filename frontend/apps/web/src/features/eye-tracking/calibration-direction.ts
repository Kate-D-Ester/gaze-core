import type { GazeOrientation } from "./calibration.types"
import type { Point } from "./eye-tracking.types"
const MINIMUM_CORNER_AXIS_RATIO = 0.4
const MAXIMUM_EDGE_AXIS_RATIO = 0.35
/** A center baseline can establish a sector, not prove exact target fixation. */
export function matchesTargetDirection(
  feature: Point,
  center: Point,
  target: Point,
  orientation: GazeOrientation,
  minimumMovement: Point,
  screenAspectRatio = 1
): boolean {
  const movement: Point = [
    (feature[0] - center[0]) * orientation.horizontal,
    (feature[1] - center[1]) * orientation.vertical,
  ]
  if (!Number.isFinite(screenAspectRatio) || screenAspectRatio <= 0) {
    return false
  }
  // Normalize angular movement for the viewport's shape before comparing diagonal proportions.
  const scaled: Point = [movement[0] / screenAspectRatio, movement[1]]
  const minimum: Point = [
    minimumMovement[0] / screenAspectRatio,
    minimumMovement[1],
  ]
  const isCorner = target[0] !== 0.5 && target[1] !== 0.5
  if (isCorner) {
    const smaller = Math.min(Math.abs(scaled[0]), Math.abs(scaled[1]))
    const larger = Math.max(Math.abs(scaled[0]), Math.abs(scaled[1]))
    if (smaller < larger * MINIMUM_CORNER_AXIS_RATIO) {
      return false
    }
  }
  for (let axis = 0; axis < 2; axis++) {
    const expected = Math.sign(target[axis] - 0.5)
    if (expected !== 0 && movement[axis] * expected < minimumMovement[axis]) {
      return false
    }
    if (expected === 0) {
      const otherAxis = 1 - axis
      const centerTolerance = Math.max(
        minimum[axis],
        Math.abs(scaled[otherAxis]) * MAXIMUM_EDGE_AXIS_RATIO
      )
      if (Math.abs(scaled[axis]) >= centerTolerance) {
        return false
      }
    }
  }
  return true
}
