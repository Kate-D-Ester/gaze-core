import { expect, test } from "bun:test"
import { validateCameraRegistration } from "../../research/gaze-3d/browser/camera-registration"
import type {
  CameraRegistration,
  CaptureGeometry,
} from "../../research/gaze-3d/browser/camera-registration.types"
import { headPoseInRange } from "../../apps/web/src/features/eye-tracking/head-tracking/head-calibration"
import { fitCalibration } from "../../apps/web/src/features/eye-tracking/calibration"
import {
  fixtureCalibrationSamples,
  fixtureReference,
} from "./head-motion-fixture"
const capture: CaptureGeometry = {
  cameraIdentity: "camera-a",
  width: 640,
  height: 480,
  rotation: 0,
  mirrorX: false,
  mirrorY: false,
}
const registration: CameraRegistration = {
  version: 1,
  id: "rig-1",
  measuredAt: "2026-10-08T00:00:00Z",
  provenance: "checkerboard and measured display",
  capture,
  intrinsics: {
    fx: 500,
    fy: 500,
    cx: 320,
    cy: 240,
    distortion: [0, 0, 0, 0, 0],
  },
  units: "metres",
  poseFrame: "camera",
  screen: { center: [0, 0, 0], rotation: [0, 0, 0], width: 0.3, height: 0.2 },
}
test("missing geometry cannot be replaced by guessed identity transforms", () => {
  expect(validateCameraRegistration(null, capture)).toBe("missing-registration")
  expect(validateCameraRegistration(registration, capture)).toBeNull()
})
test("registration requires matching capture orientation, dimensions and camera", () => {
  for (const change of [
    { width: 320 },
    { mirrorX: true },
    { rotation: 90 },
    { cameraIdentity: "camera-b" },
  ])
    expect(
      validateCameraRegistration(registration, { ...capture, ...change })
    ).toBe("capture-mismatch")
  expect(
    validateCameraRegistration(
      { ...registration, intrinsics: { ...registration.intrinsics, fx: NaN } },
      capture
    )
  ).toBe("invalid-registration")
  expect(
    validateCameraRegistration({ ...registration, provenance: "" }, capture)
  ).toBe("invalid-registration")
})
test("joint pose coverage rejects unobserved combinations inside the old axis box", () => {
  const fitted = fitCalibration(fixtureCalibrationSamples())!.headCompensation!
  const combined = {
    ...fixtureReference,
    rotation: [0.15, 0.15, 0.15] as [number, number, number],
  }
  expect(headPoseInRange(fitted, combined)).toBe(false)
  expect(headPoseInRange(fitted, fixtureReference)).toBe(true)
})
