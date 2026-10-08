import { describe, expect, test } from "bun:test"
import {
  CALIBRATION_TARGETS,
  fitCalibration,
  fitInitialCalibration,
  mapGaze,
} from "../../apps/web/src/features/eye-tracking/calibration"
import type { CalibrationSample } from "../../apps/web/src/features/eye-tracking/calibration.types"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

function curvedSamples(): CalibrationSample[] {
  return CALIBRATION_TARGETS.map((target) => ({
    target,
    // Invert the synthetic optical distortion: X = .5 + 2u + .8u²,
    // Y = .5 + 2v - .4v². Targets stay on the actual nine-point grid.
    feature: [
      (Math.sqrt(4 + 3.2 * (target[0] - 0.5)) - 2) / 1.6,
      (Math.sqrt(4 - 1.6 * (target[1] - 0.5)) - 2) / -0.8,
    ],
  }))
}

function affineSamples(): CalibrationSample[] {
  return CALIBRATION_TARGETS.map((target) => ({
    target,
    feature: [(target[0] - 0.5) / 2, (target[1] - 0.5) / 3],
  }))
}

describe("screen mapping selection", () => {
  test("corrects repeatable curvature at unseen fixations rather than smoothing the wrong point", () => {
    const calibration = fitCalibration(curvedSamples())!
    const point = mapGaze(calibration, [0.12, -0.08])!

    expect(calibration.quadraticMapping).toBeDefined()
    expect(calibration.validationError).toBeLessThan(0.005)
    expect(point[0]).toBeCloseTo(0.75152, 3)
    expect(point[1]).toBeCloseTo(0.33744, 3)
  })

  test("keeps the affine mapping when curvature is unsupported", () => {
    const calibration = fitCalibration(affineSamples())!

    expect(calibration.quadraticMapping).toBeUndefined()
    expect(calibration.validationError).toBeLessThan(1e-8)
    const point = mapGaze(calibration, [0.6, 0])!
    expect(point[0]).toBeCloseTo(1.7, 8)
    expect(point[1]).toBeCloseTo(0.5, 8)
  })

  test("does not mistake a single bad fixation for a correctable distortion", () => {
    const samples = affineSamples()
    samples[0].feature = [0.1, -0.06]
    const calibration = fitCalibration(samples)!

    expect(calibration.quadraticMapping).toBeUndefined()
    expect(calibration.validationError).toBeGreaterThan(0.05)
  })

  test("holds out all repeats of a target together", () => {
    const samples = curvedSamples()
    const repeated = samples.flatMap((sample) => [sample, sample, sample])
    const singleFit = fitCalibration(samples)!
    const repeatedFit = fitCalibration(repeated)!

    expect(repeatedFit.validationError).toBeCloseTo(
      singleFit.validationError,
      8
    )
    const point = mapGaze(repeatedFit, [0.12, -0.08])!
    expect(point[0]).toBeCloseTo(0.75152, 3)
    expect(point[1]).toBeCloseTo(0.33744, 3)
  })

  test("keeps partial directional guidance affine", () => {
    const calibration = fitInitialCalibration(curvedSamples().slice(0, 5))!

    expect(calibration).not.toBeNull()
    expect(calibration.quadraticMapping).toBeUndefined()
  })

  test("rejects a nonlinear fit that reverses gaze direction inside the measured range", () => {
    const samples: CalibrationSample[] = []
    for (const x of [-0.2, 0, 0.2]) {
      for (const y of [-0.2, 0, 0.2]) {
        samples.push({
          feature: [x, y],
          target: [0.5 + 0.4 * x + 2.5 * x * x, 0.5 + y],
        })
      }
    }
    const calibration = fitCalibration(samples)!

    expect(calibration).not.toBeNull()
    expect(calibration.quadraticMapping).toBeUndefined()
    expect(calibration.validationError).toBeGreaterThan(0.02)
  })

  test("rejects missing feature information instead of obtaining a fit from regularization", () => {
    const collapsed = curvedSamples().map((sample) => ({
      ...sample,
      feature: [sample.feature[0], 0] as Point,
    }))
    expect(fitCalibration(collapsed)).toBeNull()

    const invalid = curvedSamples()
    invalid[1].feature[0] = Number.NaN
    expect(fitCalibration(invalid)).toBeNull()

    const calibration = fitCalibration(curvedSamples())!
    expect(mapGaze(calibration, [Infinity, 0])).toBeNull()
  })

  test("does not let quadratic extrapolation fold a far-off-screen gaze back onto the screen", () => {
    const calibration = fitCalibration(curvedSamples())!
    const points: Point[] = [
      [0, -0.5],
      [0, -1],
      [0, -2],
    ]
    const mapped = points.map((point) => mapGaze(calibration, point)!)

    expect(mapped[0][1]).toBeLessThan(0)
    expect(mapped[1][1]).toBeLessThan(mapped[0][1])
    expect(mapped[2][1]).toBeLessThan(mapped[1][1])
    expect(mapped[2][1] - mapped[1][1]).toBeCloseTo(
      2 * (mapped[1][1] - mapped[0][1]),
      8
    )
  })
})
