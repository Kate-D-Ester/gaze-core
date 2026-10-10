import { expect, test } from "bun:test"
import { fitBasePointCalibration } from "../../apps/web/src/features/remote-eye-tracking/base-point-calibration"
import { predictBasePointCandidate } from "../../apps/web/src/features/remote-eye-tracking/base-point-input"
import type {
  CalibrationSample,
  Point,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

const targets: Point[] = [
  [0.5, 0.5],
  [0.04, 0.04],
  [0.96, 0.04],
  [0.96, 0.96],
  [0.04, 0.96],
  [0.5, 0.04],
  [0.96, 0.5],
  [0.5, 0.96],
  [0.04, 0.5],
]

function capture(
  points: Point[],
  raw: (point: Point) => Point
): CalibrationSample[] {
  return points.flatMap((target, targetId) =>
    Array.from({ length: 18 }, (_, frame) => ({
      target,
      targetId,
      observation: {
        timestamp: targetId * 10000 + frame * 100,
        width: 640,
        height: 480,
        feature: [target[0], target[1], 0],
        quality: 0.9,
        reason: null,
        eyes: [],
        faceBox: null,
        pose: {
          kind: "face" as const,
          yaw: 0,
          pitch: 0,
          roll: 0,
          x: 0.5,
          y: 0.5,
          scale: 0.2,
        },
        basePoint: raw(target),
        baseModelVersion: "blazegaze-v1",
        method: "Synthetic spatial distortion",
        processingMs: 1,
      },
    }))
  )
}

// The fixture inverts screen = raw + curvature * (raw - .5)^2.
function curvedRaw(point: Point): Point {
  return point.map(
    (value) => 0.5 + (Math.sqrt(1 + 1.6 * (value - 0.5)) - 1) / 0.8
  ) as Point
}

test("screen-edge setup corrects nonlinear bias at unseen fixations", () => {
  const model = fitBasePointCalibration("webcam", capture(targets, curvedRaw))
  expect(model).not.toBeNull()
  for (const target of [
    [0.02, 0.98],
    [0.18, 0.82],
    [0.73, 0.27],
  ] as Point[]) {
    const observation = capture([target], curvedRaw)[0]!.observation
    const prediction = predictBasePointCandidate(model!, observation)!
    expect(prediction[0]).toBeCloseTo(target[0], 3)
    expect(prediction[1]).toBeCloseTo(target[1], 3)
  }
})

test("spatial correction includes gaze-axis interaction at unseen screen edges", () => {
  // Exact inverse of screenX = rawX + .8 * (rawX - .5) * (rawY - .5).
  const raw = (point: Point): Point => [
    0.5 + (point[0] - 0.5) / (1 + 0.8 * (point[1] - 0.5)),
    point[1],
  ]
  const model = fitBasePointCalibration("webcam", capture(targets, raw))
  expect(model).not.toBeNull()
  const prediction = predictBasePointCandidate(
    model!,
    capture([[0.12, 0.91]], raw)[0]!.observation
  )!
  expect(prediction[0]).toBeCloseTo(0.12, 3)
  expect(prediction[1]).toBeCloseTo(0.91, 3)
})

test("isolated spikes and centered fixation noise preserve unseen-point accuracy", () => {
  const setup = capture(targets, curvedRaw)
  for (const [index, sample] of setup.entries()) {
    const frame = index % 18
    const point = sample.observation.basePoint!
    // Opposing noise leaves the median center intact, and two extremes are isolated.
    const noise = (frame % 2 ? 1 : -1) * 0.025
    point[0] += noise
    point[1] -= noise
    if (frame === 0) {
      sample.observation.basePoint = [40, -40]
    }
    if (frame === 1) {
      sample.observation.basePoint = [-40, 40]
    }
  }
  const model = fitBasePointCalibration("mobile", setup)
  expect(model).not.toBeNull()
  const prediction = predictBasePointCandidate(
    model!,
    capture([[0.11, 0.89]], curvedRaw)[0]!.observation
  )!
  expect(prediction[0]).toBeCloseTo(0.11, 3)
  expect(prediction[1]).toBeCloseTo(0.89, 3)
  // Raw jitter is diagnostic evidence; it must not cause a second fit rejection.
  expect(model!.crossValidationError).toBeGreaterThan(0.04)
})

test("compressed affine coordinates stay numerically stable and favor the compact model", () => {
  const raw = (point: Point): Point => [
    12 + point[0] * 0.001,
    -8 + point[1] * 0.0005,
  ]
  const model = fitBasePointCalibration("webcam", capture(targets, raw))
  expect(model).not.toBeNull()
  expect(model!.coefficients[0]).toHaveLength(3)
  const prediction = predictBasePointCandidate(
    model!,
    capture([[0.03, 0.97]], raw)[0]!.observation
  )!
  expect(prediction[0]).toBeCloseTo(0.03, 7)
  expect(prediction[1]).toBeCloseTo(0.97, 7)
})

test("regularization cannot fabricate screen geometry from constant or collinear output", () => {
  for (const raw of [
    (): Point => [0.5, 0.5],
    (point: Point): Point => [point[0], point[0] * 2],
    (): Point => [Number.MAX_VALUE, Number.MAX_VALUE],
  ]) {
    expect(fitBasePointCalibration("webcam", capture(targets, raw))).toBeNull()
  }
})

test("legacy affine profiles still predict in their original raw coordinates", () => {
  const model = fitBasePointCalibration(
    "webcam",
    capture(targets, (point) => point)
  )
  expect(model).not.toBeNull()
  const legacy = {
    ...model!,
    spatialBasis: undefined,
    featureMean: [0, 0],
    featureScale: [1, 1],
    coefficients: [
      [0.03, 1.1, 0],
      [-0.02, 0, 0.9],
    ] as [number[], number[]],
  }
  const prediction = predictBasePointCandidate(
    legacy,
    capture([[0.2, 0.8]], (point) => point)[0]!.observation
  )!
  expect(prediction[0]).toBeCloseTo(0.25, 10)
  expect(prediction[1]).toBeCloseTo(0.7, 10)
})

// These are synthetic detector errors, not a claim about wearer accuracy.
test("mapping complexity considers held-out frame noise rather than median centers alone", () => {
  const setup = capture(targets, curvedRaw)
  for (const [index, sample] of setup.entries()) {
    const sign = index % 2 === 0 ? -1 : 1
    sample.observation.basePoint![0] += sign * 0.2
    sample.observation.basePoint![1] -= sign * 0.2
  }
  // The alternating noise cancels at every fixation median. A curved map fits
  // those medians perfectly but has greater held-out frame error than an affine map.
  const model = fitBasePointCalibration("webcam", setup)!
  expect(model).not.toBeNull()
  expect(model.crossValidationError).toBeLessThan(0.28)
  // Selection must not collapse the full-screen response to suppress the noise.
  const left = predictBasePointCandidate(
    model,
    capture([[0.04, 0.5]], curvedRaw)[0]!.observation
  )!
  const right = predictBasePointCandidate(
    model,
    capture([[0.96, 0.5]], curvedRaw)[0]!.observation
  )!
  expect(right[0] - left[0]).toBeGreaterThan(0.8)
})
