import type { GazeMeasurement } from "../scene-eye-tracking/scene.types"

/** Unchecked estimates require explicit Focus permission; freshness checks always apply. */
export function verifiedGazePoint(
  gaze: GazeMeasurement | null,
  now: number,
  allowUnverifiedGaze = false
): GazeMeasurement["position"] {
  if (
    !gaze ||
    !Number.isFinite(now) ||
    !gaze.valid ||
    (gaze.estimated && !allowUnverifiedGaze) ||
    gaze.preview ||
    gaze.extrapolated ||
    !Number.isFinite(gaze.confidence) ||
    gaze.confidence < 0.5 ||
    !gaze.position
  ) {
    return null
  }
  const times = [gaze.timestamp, gaze.eyeTimestamp, gaze.sceneTimestamp]
  if (
    !times.every(
      (time) =>
        time !== null &&
        Number.isFinite(time) &&
        now - time >= 0 &&
        now - time <= 150
    ) ||
    gaze.position.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1
    )
  ) {
    return null
  }
  return gaze.position
}
