import {
  CALIBRATION_TARGETS,
  fitRemoteCalibration,
  predictRemoteGaze,
} from "../../apps/web/src/features/remote-eye-tracking/calibration"
import type {
  CalibrationSample,
  RemoteObservation,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import type { IrFeatureStrategy } from "../../research/calibration/ocular-axes.types"
import { expect, test } from "bun:test"
import { restoreOcularAxes } from "../../research/calibration/ocular-axes"
import {
  buildIrFaceFeatures,
  IR_EYE_CORNERS,
} from "../../apps/web/src/features/remote-eye-tracking/ir-face-features"
import { inspectRgbFace } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import type { Point } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import { face } from "./face-fixture"

test.each([0, 0.45, -0.45, Math.PI / 2])(
  "restore both camera axes at roll %p",
  (roll) => {
    const world = { x: 0.08, y: -0.03 }
    const local = {
      x: Math.cos(roll) * world.x + Math.sin(roll) * world.y,
      y: -Math.sin(roll) * world.x + Math.cos(roll) * world.y,
    }
    const restored = restoreOcularAxes(local, roll)!
    expect(restored.x).toBeCloseTo(world.x, 10)
    expect(restored.y).toBeCloseTo(world.y, 10)
  }
)

test("nonfinite offsets or roll are rejected", () => {
  expect(restoreOcularAxes({ x: NaN, y: 1 }, 0)).toBeNull()
  expect(restoreOcularAxes({ x: 0, y: 1 }, Infinity)).toBeNull()
})

test("independently rotated canthi restore a camera-fixed pupil displacement", () => {
  for (const roll of [-0.4, 0, 0.4]) {
    const geometry = inspectRgbFace(face(), 640, 480)
    if (!geometry.valid) throw new Error(geometry.reason)
    geometry.landmarks = geometry.landmarks.map(([x, y]) => [
      320 + Math.cos(roll) * (x - 320) - Math.sin(roll) * (y - 240),
      240 + Math.sin(roll) * (x - 320) + Math.cos(roll) * (y - 240),
    ])
    // Native face geometry has Y up; the camera image has Y down.
    // The same physical roll therefore has the opposite image angle.
    geometry.pose.roll = -roll
    const pupils: Point[] = IR_EYE_CORNERS.map(([a, b]) => {
      const first = geometry.landmarks[a]!
      const second = geometry.landmarks[b]!
      const span = Math.hypot(second[0] - first[0], second[1] - first[1])
      return [
        (first[0] + second[0]) / 2 + 0.08 * span,
        (first[1] + second[1]) / 2 - 0.03 * span,
      ]
    })
    const candidate = buildIrFaceFeatures(geometry, pupils, "camera-axes-v2")!
    expect(candidate.feature).toHaveLength(14)
    expect(candidate.feature[4]).toBeCloseTo(0.08, 8)
    expect(candidate.feature[5]).toBeCloseTo(-0.03, 8)
    const legacy = buildIrFaceFeatures(geometry, pupils)!
    expect(legacy.feature).toHaveLength(29)
    for (const result of [candidate, legacy]) {
      expect(result.cameraOcularOffsets).toHaveLength(4)
      expect(result.cameraOcularOffsets[0]).toBeCloseTo(0.08, 8)
      expect(result.cameraOcularOffsets[1]).toBeCloseTo(-0.03, 8)
      expect(result.cameraOcularOffsets[2]).toBeCloseTo(0.08, 8)
      expect(result.cameraOcularOffsets[3]).toBeCloseTo(-0.03, 8)
    }
  }
})

test("ocular counter-roll remains eye evidence rather than being flattened", () => {
  const rigid = restoreOcularAxes({ x: 0.08, y: 0 }, 0.4)!
  const counterRolled = restoreOcularAxes(
    { x: 0.08 * Math.cos(-0.1), y: 0.08 * Math.sin(-0.1) },
    0.4
  )!
  expect(
    Math.hypot(rigid.x - counterRolled.x, rigid.y - counterRolled.y)
  ).toBeGreaterThan(0.005)
})

function rolledObservation(
  target: Point,
  roll: number,
  strategy: IrFeatureStrategy,
  timestamp: number
): RemoteObservation {
  const geometry = inspectRgbFace(face(), 640, 480)
  if (!geometry.valid) throw new Error(geometry.reason)
  geometry.landmarks = geometry.landmarks.map(([x, y]) => [
    320 + Math.cos(roll) * (x - 320) - Math.sin(roll) * (y - 240),
    240 + Math.sin(roll) * (x - 320) + Math.cos(roll) * (y - 240),
  ])
  geometry.pose.roll = roll
  const pupils: Point[] = IR_EYE_CORNERS.map(([a, b]) => {
    const first = geometry.landmarks[a]!
    const second = geometry.landmarks[b]!
    const span = Math.hypot(second[0] - first[0], second[1] - first[1])
    return [
      (first[0] + second[0]) / 2 + (target[0] - 0.5) * 0.2 * span,
      (first[1] + second[1]) / 2 + (target[1] - 0.5) * 0.2 * span,
    ]
  })
  const features = buildIrFaceFeatures(geometry, pupils, strategy)!
  return {
    ...features,
    width: 640,
    height: 480,
    timestamp,
    quality: 1,
    reason: null,
    eyes: [],
    faceBox: null,
    method: "independent rotated canthi",
    processingMs: 0,
  }
}

test("the compact bank and legacy bank use identical target/roll folds", () => {
  const errors: number[] = []
  for (const strategy of ["legacy", "camera-axes-v2"] as IrFeatureStrategy[]) {
    const samples: CalibrationSample[] = []
    for (const [targetId, target] of CALIBRATION_TARGETS.entries()) {
      for (const roll of [-0.35, 0, 0.35])
        samples.push({
          targetId,
          target,
          observation: rolledObservation(
            target,
            roll,
            strategy,
            samples.length
          ),
        })
    }
    const fitted = fitRemoteCalibration("ir", samples)!
    expect(fitted).not.toBeNull()
    let maximumError = 0
    for (const roll of [-0.2, 0.2]) {
      for (const target of [
        [0.3, 0.7],
        [0.65, 0.35],
      ] as Point[]) {
        const point = predictRemoteGaze(
          fitted,
          rolledObservation(target, roll, strategy, 100)
        )!
        expect(point).not.toBeNull()
        maximumError = Math.max(
          maximumError,
          Math.hypot(point[0] - target[0], point[1] - target[1])
        )
      }
    }
    errors.push(maximumError)
  }
  expect(errors.every(Number.isFinite)).toBe(true)
  expect(errors[1]).toBeLessThan(0.001)
  expect(errors[1]).toBeLessThan(errors[0]!)
})

test("head-only target correlation cannot qualify the compact bank as eye compensation", () => {
  const samples: CalibrationSample[] = []
  for (const [targetId, target] of CALIBRATION_TARGETS.entries()) {
    for (let repeat = 0; repeat < 3; repeat++) {
      const observation = rolledObservation(
        [0.5, 0.5],
        0,
        "camera-axes-v2",
        samples.length
      )
      observation.pose!.x = 0.5 + (target[0] - 0.5) * 0.1
      observation.pose!.y = 0.5 + (target[1] - 0.5) * 0.1
      observation.feature![11] = observation.pose!.x - 0.5
      observation.feature![12] = observation.pose!.y - 0.5
      samples.push({ targetId, target, observation })
    }
  }
  expect(fitRemoteCalibration("ir", samples)).toBeNull()
})

test("rotating a constant local eye offset cannot supply missing ocular coverage", () => {
  const samples: CalibrationSample[] = []
  for (const [targetId, target] of CALIBRATION_TARGETS.entries()) {
    const roll = -0.35 + targetId * 0.0875
    for (let repeat = 0; repeat < 3; repeat++) {
      const observation = rolledObservation(
        [0.5, 0.5],
        roll,
        "camera-axes-v2",
        samples.length
      )
      const restored = restoreOcularAxes({ x: 0.1, y: 0 }, roll)!
      observation.feature!.splice(
        0,
        8,
        0.1,
        0,
        0.1,
        0,
        restored.x,
        restored.y,
        restored.x,
        restored.y
      )
      observation.pose!.x = 0.5 + (target[0] - 0.5) * 0.1
      observation.pose!.y = 0.5 + (target[1] - 0.5) * 0.1
      observation.feature![11] = observation.pose!.x - 0.5
      observation.feature![12] = observation.pose!.y - 0.5
      samples.push({ targetId, target, observation })
    }
  }
  expect(fitRemoteCalibration("ir", samples)).toBeNull()
})

test("a corrected IR feature version cannot reinterpret a stored v1 mapping", () => {
  const samples = CALIBRATION_TARGETS.flatMap((target, targetId) => {
    return Array.from({ length: 3 }, (_, repeat) => ({
      target,
      targetId,
      observation: rolledObservation(
        target,
        0,
        "camera-axes-v2",
        targetId * 3 + repeat
      ),
    }))
  })
  const fitted = fitRemoteCalibration("ir", samples)!
  expect(fitted.featureVersion).toBe("ir-camera-axes-v2")
  const oldModel = { ...fitted, featureVersion: "ir-camera-axes-v1" }
  expect(predictRemoteGaze(oldModel, samples[0].observation)).toBeNull()
})
