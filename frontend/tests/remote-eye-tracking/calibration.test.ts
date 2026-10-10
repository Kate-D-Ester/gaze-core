import { expect, test } from "bun:test"
import {
  fitRemoteCalibration,
  predictRemoteGaze,
  poseSupported,
  evaluateRemoteValidation,
} from "../../apps/web/src/features/remote-eye-tracking/calibration"
import type {
  CalibrationSample,
  RemoteObservation,
  Point,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

function observation(
  target: Point,
  headX: number,
  headY: number,
  timestamp = 100
): RemoteObservation {
  return {
    timestamp,
    width: 1280,
    height: 720,
    quality: 0.9,
    reason: null,
    eyes: [],
    faceBox: null,
    method: "test",
    processingMs: 4,
    basePoint: null,
    feature: [
      (target[0] - 0.5 - 0.25 * headX) / 0.5,
      (target[1] - 0.5 - 0.2 * headY) / 0.5,
      headX,
      headY,
    ],
    pose: {
      kind: "face",
      yaw: headX,
      pitch: headY,
      roll: 0,
      x: 0.5 + headX,
      y: 0.5 + headY,
      scale: 0.2,
    },
  }
}
function samples(): CalibrationSample[] {
  const result: CalibrationSample[] = []
  let targetId = 0
  for (const x of [0.1, 0.5, 0.9])
    for (const y of [0.1, 0.5, 0.9]) {
      for (const dx of [-0.1, 0, 0.1])
        for (const dy of [-0.08, 0.08]) {
          result.push({
            target: [x, y],
            targetId,
            observation: observation([x, y], dx, dy, result.length),
          })
        }
      targetId++
    }
  return result
}
test("calibration learns eye motion separately from changing head pose and generalizes to unseen targets", () => {
  const fitted = fitRemoteCalibration("webcam", samples())
  expect(fitted).not.toBeNull()
  expect(fitted!.targetCount).toBe(9)
  expect(fitted!.crossValidationError).toBeLessThan(0.03)
  for (const head of [-0.08, 0.07]) {
    const point = predictRemoteGaze(
      fitted!,
      observation([0.3, 0.7], head, -0.04)
    )
    expect(point).not.toBeNull()
    expect(point![0]).toBeCloseTo(0.3, 2)
    expect(point![1]).toBeCloseTo(0.7, 2)
  }
})
test("different head positions at each target are retained instead of reducing targets to one input", () => {
  const input = samples().map((s) => {
    const h = ((s.targetId % 3) - 1) * 0.1
    return {
      ...s,
      observation: observation(s.target, h, 0.04 * Math.sin(s.targetId)),
    }
  })
  const fitted = fitRemoteCalibration("mobile", input)
  expect(fitted).not.toBeNull()
  expect(fitted!.sampleCount).toBe(input.length)
  expect(fitted!.poseBounds.min[0]).toBeCloseTo(-0.1)
  expect(fitted!.poseBounds.max[0]).toBeCloseTo(0.1)
})
test("duplicate samples from a single target cannot masquerade as full screen coverage", () => {
  expect(
    fitRemoteCalibration(
      "webcam",
      Array.from({ length: 100 }, (_, targetId) => ({
        target: [0.5, 0.5] as Point,
        targetId,
        observation: observation([0.5, 0.5], 0, 0),
      }))
    )
  ).toBeNull()
})
test("constant or nonfinite inputs cannot produce an apparently calibrated mapping", () => {
  expect(
    fitRemoteCalibration(
      "webcam",
      samples().map((s) => ({
        ...s,
        observation: { ...s.observation, feature: [0, 0, 0, 0] },
      }))
    )
  ).toBeNull()
  expect(
    fitRemoteCalibration(
      "webcam",
      samples().map((s) => ({
        ...s,
        observation: { ...s.observation, feature: [NaN, 0] },
      }))
    )
  ).toBeNull()
})
test("pose coverage affects confidence while invalid observations still suppress live gaze", () => {
  const fitted = fitRemoteCalibration("webcam", samples())!
  const far = observation([0.5, 0.5], 0.8, 0)
  expect(poseSupported(fitted, far.pose)).toBe(false)
  const farPoint = predictRemoteGaze(fitted, far)!
  expect(farPoint.every(Number.isFinite)).toBe(true)
  expect(farPoint[0]).toBeCloseTo(0.5, 2)
  expect(farPoint[1]).toBeCloseTo(0.5, 2)
  expect(
    predictRemoteGaze(fitted, { ...far, pose: null, feature: null })
  ).toBeNull()
  expect(
    predictRemoteGaze(fitted, {
      ...observation([0.5, 0.5], 0, 0),
      feature: [0],
    })
  ).toBeNull()
})
test("validation measures unseen targets and keeps systematic error separate from jitter", () => {
  const fitted = fitRemoteCalibration("webcam", samples())!
  const result = evaluateRemoteValidation(
    fitted,
    [
      {
        target: [0.3, 0.7],
        targetId: 0,
        observation: observation([0.32, 0.7], 0, 0),
      },
      {
        target: [0.3, 0.7],
        targetId: 0,
        observation: observation([0.32, 0.7], 0, 0),
      },
    ],
    1000,
    500
  )
  expect(result).not.toBeNull()
  expect(result!.meanPixels).toBeCloseTo(20, 0)
  expect(result!.jitterPixels).toBeLessThan(0.1)
  expect(result!.targetCount).toBe(1)
})

test("joint pose coverage remains false for unseen combinations while valid gaze stays visible", () => {
  const input = samples().map((s, i) => {
    const yaw = i % 2 ? 0.4 : -0.4
    const x = i % 2 ? 0.7 : 0.3
    return {
      ...s,
      observation: {
        ...s.observation,
        feature: [
          s.target[0] - 0.5 * yaw - 0.4 * (x - 0.5),
          s.target[1],
          yaw,
          x - 0.5,
        ],
        pose: { ...s.observation.pose!, yaw, x, pitch: 0, y: 0.5 },
      },
    }
  })
  const fitted = fitRemoteCalibration("webcam", input)!
  expect(fitted).not.toBeNull()
  const unseen = {
    ...input[1]!.observation,
    pose: { ...input[1]!.observation.pose!, yaw: 0.4, x: 0.3 },
  }
  expect(poseSupported(fitted, unseen.pose)).toBe(false)
  const predicted = predictRemoteGaze(fitted, unseen)!
  expect(predicted.every(Number.isFinite)).toBe(true)
  expect(predicted[0]).toBeCloseTo(input[1]!.target[0], 2)
  expect(predicted[1]).toBeCloseTo(input[1]!.target[1], 2)
})

test("validation measures the adjusted gaze without modifying calibration samples", () => {
  const fitted = fitRemoteCalibration("webcam", samples())!
  const sample: CalibrationSample = {
    target: [0.3, 0.7],
    targetId: 0,
    observation: observation([0.32, 0.68], 0, 0),
  }
  const before = JSON.stringify({ fitted, sample })
  const raw = evaluateRemoteValidation(fitted, [sample], 1000, 500)!
  const adjusted = evaluateRemoteValidation(
    fitted,
    [sample],
    1000,
    500,
    [-0.02, 0.02]
  )!
  expect(raw.meanPixels).toBeGreaterThan(20)
  expect(adjusted.meanPixels).toBeLessThan(1)
  expect(JSON.stringify({ fitted, sample })).toBe(before)
})

test("feature versions cannot mix or reuse equal-dimensional coefficients", () => {
  const input = samples()
  const fitted = fitRemoteCalibration("webcam", input)!
  expect(
    predictRemoteGaze(fitted, {
      ...observation([0.3, 0.7], 0, 0),
      featureVersion: "different-bank-v1",
    })
  ).toBeNull()
  input[0]!.observation.featureVersion = "different-bank-v1"
  expect(fitRemoteCalibration("webcam", input)).toBeNull()
})
