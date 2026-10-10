import type { Point } from "./remote-eye-tracking.types"
import type { RgbFaceGeometry } from "./rgb-features.types"
import type {
  EyeMovementVector,
  RemoteTrackingVectors,
} from "./tracking-vectors.types"

/** MediaPipe indices are ordered as the wearer's right eye, then left eye. */
export const EYE_CANTHI = [
  [33, 133],
  [362, 263],
] as const

export function measureEyeMovement(
  landmarks: Point[],
  eyeIndex: number,
  center: Point | null,
  source: EyeMovementVector["source"]
): EyeMovementVector | null {
  const corners = EYE_CANTHI[eyeIndex]
  if (!center || !corners) {
    return null
  }
  const first = landmarks[corners[0]]
  const second = landmarks[corners[1]]
  if (
    !first ||
    !second ||
    ![...first, ...second, ...center].every(Number.isFinite)
  ) {
    return null
  }
  const eyeWidth = Math.hypot(second[0] - first[0], second[1] - first[1])
  if (eyeWidth < 1) {
    return null
  }
  const origin: Point = [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]
  const camera: Point = [
    (center[0] - origin[0]) / eyeWidth,
    (center[1] - origin[1]) / eyeWidth,
  ]
  const horizontal = (second[0] - first[0]) / eyeWidth
  const vertical = (second[1] - first[1]) / eyeWidth
  const local: Point = [
    camera[0] * horizontal + camera[1] * vertical,
    -camera[0] * vertical + camera[1] * horizontal,
  ]
  return {
    side: eyeIndex === 0 ? "right" : "left",
    source,
    origin,
    center: [...center],
    eyeWidth,
    camera,
    local,
  }
}

/** Reuse this frame's landmarks and pupils; no extra detector or inference pass. */
export function buildTrackingVectors(
  geometry: RgbFaceGeometry,
  centers: (Point | null)[] = geometry.eyes.map((eye) => eye.center),
  source: EyeMovementVector["source"] = "iris-landmarks"
): RemoteTrackingVectors {
  const rightEye = measureEyeMovement(
    geometry.landmarks,
    0,
    centers[0] ?? null,
    source
  )
  const leftEye = measureEyeMovement(
    geometry.landmarks,
    1,
    centers[1] ?? null,
    source
  )
  const rotation = geometry.rotation
  // Native metric geometry has Y up. Flip Y once to match the image overlay.
  const direction: [number, number, number] = [
    rotation[0]?.[2] ?? NaN,
    -(rotation[1]?.[2] ?? NaN),
    rotation[2]?.[2] ?? NaN,
  ]
  const length = Math.hypot(...direction)
  let face: RemoteTrackingVectors["face"] = null
  const canthi = EYE_CANTHI.flatMap((corners) =>
    corners.map((index) => geometry.landmarks[index])
  )
  if (
    length > 0 &&
    Number.isFinite(length) &&
    canthi.every((point) => point?.every(Number.isFinite))
  ) {
    face = {
      origin: [
        canthi.reduce((sum, point) => sum + point[0], 0) / canthi.length,
        canthi.reduce((sum, point) => sum + point[1], 0) / canthi.length,
      ],
      direction: direction.map((value) => value / length) as [
        number,
        number,
        number,
      ],
    }
  }
  return {
    coordinateSpace: "camera-image-x-right-y-down-z-toward-camera",
    face,
    leftEye,
    rightEye,
  }
}
