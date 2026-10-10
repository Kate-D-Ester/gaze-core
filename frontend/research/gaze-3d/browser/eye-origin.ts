import { dot } from "../../../apps/web/src/features/eye-tracking/geometry"
import type { Vector3 } from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"
import { isFiniteVector3 } from "./gaze-geometry"
import type { EstimatedEyeOrigin, EyeOriginInput } from "./eye-origin.types"

/** Solve two camera back-projection rays against a measured rigid face-anchor span.
 * Scale and pose must come from the caller; this never substitutes average face dimensions.
 * Image points must already be undistorted for these calibrated intrinsics.
 */
export function estimateEyeOrigin(
  input: EyeOriginInput
): EstimatedEyeOrigin | null {
  const {
    intrinsics,
    leftAnchorPixels,
    rightAnchorPixels,
    anchorSpanMetres,
    eyeCenterFromAnchorMidpointMetres,
  } = input
  if (
    !isFiniteVector3(anchorSpanMetres) ||
    !isFiniteVector3(eyeCenterFromAnchorMidpointMetres) ||
    Math.hypot(...anchorSpanMetres) < 1e-6 ||
    ![
      intrinsics.fx,
      intrinsics.fy,
      intrinsics.imageWidth,
      intrinsics.imageHeight,
    ].every((value) => Number.isFinite(value) && value > 0) ||
    ![
      intrinsics.cx,
      intrinsics.cy,
      ...leftAnchorPixels,
      ...rightAnchorPixels,
    ].every(Number.isFinite)
  ) {
    return null
  }
  for (const point of [leftAnchorPixels, rightAnchorPixels]) {
    if (
      point.length !== 2 ||
      point[0] < 0 ||
      point[0] >= intrinsics.imageWidth ||
      point[1] < 0 ||
      point[1] >= intrinsics.imageHeight
    ) {
      return null
    }
  }
  const left: Vector3 = [
    (leftAnchorPixels[0] - intrinsics.cx) / intrinsics.fx,
    (leftAnchorPixels[1] - intrinsics.cy) / intrinsics.fy,
    1,
  ]
  const right: Vector3 = [
    (rightAnchorPixels[0] - intrinsics.cx) / intrinsics.fx,
    (rightAnchorPixels[1] - intrinsics.cy) / intrinsics.fy,
    1,
  ]
  const a = dot(left, left)
  const b = -dot(left, right)
  const c = dot(right, right)
  const determinant = a * c - b * b
  if (!Number.isFinite(determinant) || determinant < 1e-10 * a * c) {
    return null
  }
  const leftRhs = -dot(left, anchorSpanMetres)
  const rightRhs = dot(right, anchorSpanMetres)
  const leftDepth = (c * leftRhs - b * rightRhs) / determinant
  const rightDepth = (a * rightRhs - b * leftRhs) / determinant
  if (
    !Number.isFinite(leftDepth + rightDepth) ||
    leftDepth <= 0 ||
    rightDepth <= 0
  ) {
    return null
  }
  const originMetres: Vector3 = [
    (leftDepth * left[0] + rightDepth * right[0]) / 2 +
      eyeCenterFromAnchorMidpointMetres[0],
    (leftDepth * left[1] + rightDepth * right[1]) / 2 +
      eyeCenterFromAnchorMidpointMetres[1],
    (leftDepth + rightDepth) / 2 + eyeCenterFromAnchorMidpointMetres[2],
  ]
  const residual: Vector3 = [
    rightDepth * right[0] - leftDepth * left[0] - anchorSpanMetres[0],
    rightDepth * right[1] - leftDepth * left[1] - anchorSpanMetres[1],
    rightDepth - leftDepth - anchorSpanMetres[2],
  ]
  if (
    !isFiniteVector3(originMetres) ||
    originMetres[2] <= 0 ||
    !isFiniteVector3(residual)
  ) {
    return null
  }
  return {
    originMetres,
    anchorResidualMetres: Math.hypot(...residual),
    source: "monocular-estimate",
  }
}
