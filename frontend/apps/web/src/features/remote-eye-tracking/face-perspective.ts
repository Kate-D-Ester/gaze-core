import type { FacePerspectiveInput } from "./face-perspective.types"

export const MIN_FACE_SCALE = 0.025

/** Undo tangent-plane foreshortening after canthus-based roll normalization.
 * This is a head-relative image feature, not an eyeball radius or metric gaze ray.
 */
export function normalizeHeadPlaneEyeOffsets(
  offsets: number[],
  yaw: number,
  pitch: number
): number[] | null {
  const cy = Math.cos(yaw)
  const cp = Math.cos(pitch)
  if (
    offsets.length !== 4 ||
    ![...offsets, yaw, pitch].every(Number.isFinite) ||
    cy < 0.5 ||
    cp < 0.5
  ) {
    return null
  }
  const result: number[] = []
  for (let eye = 0; eye < 2; eye++) {
    const x = offsets[eye * 2]!
    const y = offsets[eye * 2 + 1]!
    result.push(x + Math.sin(yaw) * Math.tan(pitch) * y, (y * cy) / cp)
  }
  return result
}

/**
 * Relative perspective terms for a learned screen mapping, never metric depth.
 * Under weak perspective, inter-eye spacing is proportional to cos(yaw) / Z.
 * Removing that foreshortening separates turning from changing distance.
 * Screen displacement then depends on both eye position and distance × direction;
 * calibration learns the relationship of measured ocular offsets to direction.
 */
export function buildFacePerspectiveFeatures({
  pose,
  offsets,
}: FacePerspectiveInput): number[] | null {
  const { yaw, pitch, roll, x, y, scale } = pose
  if (
    pose.kind !== "face" ||
    yaw === null ||
    pitch === null ||
    roll === null ||
    offsets.length !== 4 ||
    ![yaw, pitch, roll, x, y, scale, ...offsets].every(Number.isFinite) ||
    scale < MIN_FACE_SCALE
  ) {
    return null
  }
  const foreshortening = Math.cos(yaw)
  if (foreshortening < 0.5) {
    return null
  }
  const relativeDistance = foreshortening / scale
  const features = [
    relativeDistance,
    (x - 0.5) * relativeDistance,
    (y - 0.5) * relativeDistance,
    ...offsets.map((offset) => offset * relativeDistance),
    yaw * relativeDistance,
    pitch * relativeDistance,
  ]
  return features.every(Number.isFinite) ? features : null
}
