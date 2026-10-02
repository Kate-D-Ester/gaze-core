import { expect, test } from "bun:test"
import { getScreenGaze } from "../../apps/web/src/features/eye-tracking/screen-gaze"
import type {
  Calibration,
  TrackingFrame,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

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
