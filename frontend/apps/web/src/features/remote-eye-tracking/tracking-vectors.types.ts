import type { Point } from "./remote-eye-tracking.types"

export type FaceDirection = {
  origin: Point
  /** Unit direction in camera axes: X right, Y down, Z toward the camera. */
  direction: [number, number, number]
}

/** Measured pupil/iris displacement, not an optical or visual 3D gaze ray. */
export type EyeMovementVector = {
  side: "left" | "right"
  source: "iris-landmarks" | "ir-pupil"
  origin: Point
  center: Point
  eyeWidth: number
  /** Displacement divided by canthus distance, in camera image axes. */
  camera: Point
  /** The same displacement in the measured canthus basis. */
  local: Point
}

export type RemoteTrackingVectors = {
  coordinateSpace: "camera-image-x-right-y-down-z-toward-camera"
  face: FaceDirection | null
  /** Anatomical sides belong to the wearer, regardless of preview mirroring. */
  leftEye: EyeMovementVector | null
  rightEye: EyeMovementVector | null
}
