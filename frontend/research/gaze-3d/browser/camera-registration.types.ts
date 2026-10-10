import type { Vector3 } from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"
export type CaptureGeometry = {
  cameraIdentity: string
  width: number
  height: number
  rotation: number
  mirrorX: boolean
  mirrorY: boolean
}
export type CameraRegistration = {
  version: 1
  id: string
  measuredAt: string
  provenance: string
  capture: CaptureGeometry
  intrinsics: {
    fx: number
    fy: number
    cx: number
    cy: number
    distortion: number[]
  }
  units: "metres" | "reference-depth"
  poseFrame: "camera"
  screen: { center: Vector3; rotation: Vector3; width: number; height: number }
}
export type CameraRegistrationIssue =
  "missing-registration" | "invalid-registration" | "capture-mismatch"
