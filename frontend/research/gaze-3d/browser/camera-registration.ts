import {
  isFiniteNumber,
  isVector,
} from "../../../apps/web/src/features/tracking-calibration/runtime-validation"
import type {
  CameraRegistration,
  CameraRegistrationIssue,
  CaptureGeometry,
} from "./camera-registration.types"
/** Calibrated intrinsics belong to the actual capture image, not its CSS preview. */
export function validateCameraRegistration(
  registration: CameraRegistration | null,
  capture: CaptureGeometry
): CameraRegistrationIssue | null {
  if (!registration) {
    return "missing-registration"
  }
  const { intrinsics, screen } = registration
  if (
    registration.version !== 1 ||
    !registration.id ||
    !registration.provenance.trim() ||
    !Number.isFinite(Date.parse(registration.measuredAt)) ||
    registration.poseFrame !== "camera" ||
    !["metres", "reference-depth"].includes(registration.units)
  ) {
    return "invalid-registration"
  }
  if (
    ![intrinsics.fx, intrinsics.fy, screen.width, screen.height].every(
      (value) => isFiniteNumber(value) && value > 0
    )
  ) {
    return "invalid-registration"
  }
  if (
    ![intrinsics.cx, intrinsics.cy].every(isFiniteNumber) ||
    !isVector(intrinsics.distortion, 5) ||
    !isVector(screen.center, 3) ||
    !isVector(screen.rotation, 3)
  ) {
    return "invalid-registration"
  }
  const recorded = registration.capture
  if (
    ![recorded.width, recorded.height].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 16384
    ) ||
    !isFiniteNumber(recorded.rotation) ||
    !recorded.cameraIdentity
  ) {
    return "invalid-registration"
  }
  if (
    intrinsics.cx < 0 ||
    intrinsics.cx > recorded.width ||
    intrinsics.cy < 0 ||
    intrinsics.cy > recorded.height
  ) {
    return "invalid-registration"
  }
  for (const key of [
    "cameraIdentity",
    "width",
    "height",
    "rotation",
    "mirrorX",
    "mirrorY",
  ] as const) {
    if (recorded[key] !== capture[key]) {
      return "capture-mismatch"
    }
  }
  return null
}
