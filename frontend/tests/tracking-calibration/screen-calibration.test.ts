import { expect, test } from "bun:test"
import {
  SCREEN_CALIBRATION_TARGETS,
  ScreenCalibrationGuide,
  isScreenCalibrationGrid,
} from "../../apps/web/src/features/tracking-calibration/screen-calibration"
import { CALIBRATION_TARGETS as remote } from "../../apps/web/src/features/remote-eye-tracking/calibration"
import { CALIBRATION_TARGETS as screen } from "../../apps/web/src/features/eye-tracking/calibration"

test("screen trackers share the requested center, corners and side-edge sequence", () => {
  expect(SCREEN_CALIBRATION_TARGETS).toEqual([
    [0.5, 0.5],
    [0.04, 0.04],
    [0.96, 0.04],
    [0.5, 0.96],
    [0.04, 0.96],
    [0.5, 0.04],
    [0.96, 0.96],
    [0.04, 0.5],
    [0.96, 0.5],
  ])
  expect(remote).toBe(SCREEN_CALIBRATION_TARGETS)
  expect(screen).toBe(SCREEN_CALIBRATION_TARGETS)
})
test("accepted older grids retain their order and inset; malformed coverage cannot seed a head retry", () => {
  const older = [
    [0.5, 0.5],
    [0.1, 0.1],
    [0.5, 0.1],
    [0.9, 0.1],
    [0.9, 0.5],
    [0.9, 0.9],
    [0.5, 0.9],
    [0.1, 0.9],
    [0.1, 0.5],
  ] as typeof SCREEN_CALIBRATION_TARGETS
  expect(isScreenCalibrationGrid(older)).toBe(true)
  expect(isScreenCalibrationGrid(SCREEN_CALIBRATION_TARGETS)).toBe(true)
  expect(isScreenCalibrationGrid([older[0], ...older.slice(0, 8)])).toBe(false)
  expect(
    isScreenCalibrationGrid([
      [0.5, 0.5, 0.5] as unknown as (typeof older)[0],
      ...older.slice(1),
    ])
  ).toBe(false)
})

test("center is cooperative; later dots reject the center and wrong quadrants", () => {
  const guide = new ScreenCalibrationGuide([1, 1])
  expect(guide.matches([0.2, 0.8], [0.5, 0.5])).toBe(true)
  guide.record(
    [0.5, 0.5],
    [
      [0.2, 0.8],
      [0.201, 0.801],
      [0.199, 0.799],
    ]
  )
  expect(guide.matches([0.1999, 0.8001], [0.04, 0.96])).toBe(false)
  expect(guide.matches([0.2, 0.8], [0.04, 0.96])).toBe(false)
  expect(guide.matches([0.4, 0.9], [0.04, 0.96])).toBe(false)
  expect(guide.matches([0.1, 0.9], [0.04, 0.96])).toBe(true)
})

test("the middle band allows 85% of learned displacement without assuming equal eye-axis scales", () => {
  const guide = new ScreenCalibrationGuide([1, 1])
  guide.record([0.5, 0.5], [[0.3, 0.6]])
  guide.record([0.04, 0.96], [[0.1, 0.62]])
  expect(guide.matches([0.3 - 0.2 * 0.84, 0.57], [0.5, 0.04])).toBe(true)
  expect(guide.matches([0.3 - 0.2 * 0.86, 0.57], [0.5, 0.04])).toBe(false)
  expect(guide.matches([0.1, 0.62], [0.5, 0.04])).toBe(false)
  guide.record([0.5, 0.04], [[0.3, 0.57]])
  expect(guide.matches([0.48, 0.62], [0.96, 0.96])).toBe(true)
  expect(guide.matches([0.3, 0.6], [0.96, 0.96])).toBe(false)
})

test("camera mirroring and center noise are explicit; invalid readings cannot qualify", () => {
  const guide = new ScreenCalibrationGuide([-1, 1])
  guide.record(
    [0.5, 0.5],
    [
      [0, 0],
      [0.003, 0.003],
      [-0.003, -0.003],
    ]
  )
  expect(guide.matches([0.001, 0.001], [0.04, 0.96])).toBe(false)
  expect(guide.matches([0.2, 0.1], [0.04, 0.96])).toBe(true)
  expect(guide.matches([-0.2, 0.1], [0.04, 0.96])).toBe(false)
  expect(guide.matches([NaN, 0.1], [0.04, 0.96])).toBe(false)
})
test("tiny floating-point drift is not a corner movement even with a perfectly static center", () => {
  const guide = new ScreenCalibrationGuide([1, 1])
  guide.record(
    [0.5, 0.5],
    [
      [0, 0],
      [0, 0],
      [0, 0],
    ]
  )
  expect(guide.matches([-0.00001, 0.00001], [0.04, 0.96])).toBe(false)
})
test("a learned middle band stays at 85% even when the measured edge span is small", () => {
  const guide = new ScreenCalibrationGuide([1, 1], 0.015)
  guide.record([0.5, 0.5], [[0.5, 0.5]])
  expect(guide.matches([0.48, 0.52], [0.04, 0.96])).toBe(true)
  guide.record([0.04, 0.96], [[0.48, 0.52]])
  expect(guide.matches([0.48, 0.48], [0.5, 0.04])).toBe(false)
  expect(guide.matches([0.5 - 0.02 * 0.84, 0.48], [0.5, 0.04])).toBe(true)
  expect(guide.matches([0.5 - 0.02 * 0.86, 0.48], [0.5, 0.04])).toBe(false)
})

test("a modest movement toward an edge qualifies while near-center and opposite looks do not", () => {
  const guide = new ScreenCalibrationGuide([1, 1])
  guide.record([0.5, 0.5], [[0.5, 0.5]])
  guide.record([0.04, 0.04], [[0.2, 0.2]])
  expect(guide.matches([0.5 - 0.3 * 0.16, 0.5], [0.04, 0.5])).toBe(true)
  expect(guide.matches([0.5 - 0.3 * 0.14, 0.5], [0.04, 0.5])).toBe(false)
  expect(guide.matches([0.5, 0.5], [0.04, 0.5])).toBe(false)
  expect(guide.matches([0.8, 0.5], [0.04, 0.5])).toBe(false)
})

test("a newly visited side does not inherit the opposite side's larger eye response", () => {
  const guide = new ScreenCalibrationGuide([1, 1], 0.015)
  guide.record([0.5, 0.5], [[0.5, 0.85]])
  guide.record([0.04, 0.04], [[0.1, 0.2]])
  guide.record([0.96, 0.04], [[0.9, 0.15]])
  // The requested order visits the two upper corners before the first lower dot.
  // A biased estimator can have a much smaller downward range than upward range.
  expect(guide.matches([0.5, 0.91], [0.5, 0.96])).toBe(true)
  expect(guide.matches([0.5, 0.85], [0.5, 0.96])).toBe(false)
  expect(guide.matches([0.5, 0.7], [0.5, 0.96])).toBe(false)
})
