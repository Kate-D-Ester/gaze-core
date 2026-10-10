import { expect, test } from "bun:test"
import { getScreenGaze } from "../../apps/web/src/features/eye-tracking/screen-gaze"
import type {
  Calibration,
  TrackingFrame,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import { DEFAULT_GAZE_ORIENTATION } from "../../apps/web/src/features/eye-tracking/calibration-orientation"
import { mapHeadCompensatedGaze } from "../../apps/web/src/features/eye-tracking/head-tracking/head-calibration"
import type { HeadCompensation } from "../../apps/web/src/features/eye-tracking/head-tracking/head-calibration.types"
import type { HeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose.types"

const calibration: Calibration = {
  coefficients: [
    [0.5, 2, 0],
    [0.5, 0, 3],
  ],
  validationError: 0,
}
const frame = {
  id: 1,
  timestamp: 1000,
  gaze: { direction: [0.1, -0.1, -1] },
} as TrackingFrame

const reference: HeadPose = {
  id: 1,
  timestamp: 1000,
  position: [0, 0, -50],
  rotation: [0, 0, 0],
}
const geometric: HeadCompensation = {
  method: "calibrated-ray-plane",
  reference,
  orientation: DEFAULT_GAZE_ORIENTATION,
  coefficients: calibration.coefficients,
  validationError: 0,
  maximumValidationError: 0,
  envelope: { minimum: Array(6).fill(-0.02), maximum: Array(6).fill(0.02) },
  poseSamples: [Array(6).fill(0)],
  geometry: {
    referenceDepth: 50,
    featureCenter: [0, 0],
    featureScale: [1, 1],
    eyeRay: [0, 1, 0, 0, 0, 1, 0, 0],
    eyeOrigin: [0, 0, 0],
    screenCenter: [0, 0, 0],
    screenRotation: [0, 0, 0],
    screenWidth: 0.6,
    screenAspectRatio: 1.6,
  },
}
const regression: HeadCompensation = {
  method: "calibrated-pose-regression",
  reference,
  orientation: DEFAULT_GAZE_ORIENTATION,
  coefficients: calibration.coefficients,
  validationError: 0,
  maximumValidationError: 0,
  envelope: geometric.envelope,
  poseSamples: geometric.poseSamples,
  mapping: {
    center: [0, 0, 0, 0, 0, 0, 0, 0],
    scale: [1, 1, 1, 1, 1, 1, 1, 1],
    coefficients: [
      [0.5, 1, 0, 1, 0, 0, 0, 0, 0],
      [0.5, 0, 1, 0, 0, 0, 0, 0, 0],
    ],
  },
}

test("fresh eye readings map to screen, stale readings immediately lose output", () => {
  expect(getScreenGaze(calibration, frame, null, 1100).point).toEqual([
    0.7, 0.19999999999999996,
  ])
  expect(getScreenGaze(calibration, frame, null, 1500).point).toBeNull()
  expect(getScreenGaze(calibration, null, null, 1100).status).toBe("eye-lost")
})

test("a compensated calibration cannot silently fall back to eye-only gaze", () => {
  const compensated = { ...calibration, headCompensation: {} } as Calibration
  expect(getScreenGaze(compensated, frame, null, 1100).status).toBe("head-lost")
  expect(getScreenGaze(compensated, frame, null, 1100).point).toBeNull()
})

test("valid synchronized head motion keeps a fixed point beyond measured pose coverage", () => {
  const pose: HeadPose = { ...reference, position: [6, 0, -50] }
  const fixedFrame = {
    ...frame,
    gaze: { direction: [-0.12, 0, -1] },
  } as TrackingFrame
  for (const headCompensation of [geometric, regression]) {
    const reading = getScreenGaze(
      { ...calibration, headCompensation },
      fixedFrame,
      pose,
      1100
    )
    expect(reading.status).toBe("head-outside-range")
    expect(reading.point).not.toBeNull()
    expect(reading.point![0]).toBeCloseTo(0.5, 10)
    expect(reading.point![1]).toBeCloseTo(0.5, 10)
    const mapped = mapHeadCompensatedGaze(headCompensation, [-0.12, 0], pose)
    expect(mapped![0]).toBeCloseTo(0.5, 10)
  }
})

test("invalid stale or unsynchronized head readings still suppress compensated gaze", () => {
  for (const headCompensation of [geometric, regression]) {
    const model = { ...calibration, headCompensation }
    for (const pose of [
      { ...reference, position: [0, 0, 1] },
      { ...reference, rotation: [0, NaN, 0] },
      { ...reference, timestamp: 500 },
      { ...reference, timestamp: 1040 },
    ] as HeadPose[]) {
      expect(getScreenGaze(model, frame, pose, 1100).point).toBeNull()
    }
  }
})

test("pose extrapolation preserves offscreen coordinates and invalid ray rejection", () => {
  const model = { ...calibration, headCompensation: geometric }
  const offscreenPose: HeadPose = { ...reference, position: [30, 0, -50] }
  const centeredFrame = {
    ...frame,
    gaze: { direction: [0, 0, -1] },
  } as TrackingFrame
  const offscreen = getScreenGaze(model, centeredFrame, offscreenPose, 1100)
  expect(offscreen.status).toBe("outside-screen")
  expect(offscreen.point![0]).toBeCloseTo(-0.5, 10)
  const invalidRayPose: HeadPose = { ...reference, rotation: [0, Math.PI, 0] }
  expect(
    getScreenGaze(model, centeredFrame, invalidRayPose, 1100).point
  ).toBeNull()
})
