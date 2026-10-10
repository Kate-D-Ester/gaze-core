import { describe, expect, test } from "bun:test"
import {
  fitRemoteCalibration,
  predictRemoteGaze,
  poseSupported,
} from "../../apps/web/src/features/remote-eye-tracking/calibration"
import { buildIrFaceFeatures } from "../../apps/web/src/features/remote-eye-tracking/ir-face-features"
import type {
  CalibrationSample,
  Point,
  RemoteMode,
  RemoteObservation,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import {
  buildRgbFeatures,
  inspectRgbFace,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import { face } from "./face-fixture"

/**
 * A weak-perspective camera with focal length 0.2 and a unit inter-eye baseline.
 * Ocular offsets use a first-order angular response to screen displacement.
 * These controlled observations test mapping geometry, not detector accuracy.
 */
function observation(
  mode: RemoteMode,
  target: Point,
  distance: number,
  yaw = 0,
  headX = 0,
  scaleNoise = 0
): RemoteObservation {
  const geometry = inspectRgbFace(face(yaw), 640, 480)
  if (!geometry.valid) {
    throw new Error(geometry.reason)
  }
  const headY = headX / 2
  const horizontal = 0.2 * ((target[0] - 0.5 - headX) / distance - yaw / 4)
  const vertical = (0.2 * (target[1] - 0.5 - headY)) / distance
  geometry.pose = {
    ...geometry.pose,
    scale: ((0.2 * Math.cos(yaw)) / distance) * (1 + scaleNoise),
    x: 0.5 + (0.2 * headX) / distance,
    y: 0.5 + (0.2 * headY) / distance,
  }
  geometry.irisOffsets = [horizontal, vertical, horizontal, vertical]
  let feature: number[] | null
  if (mode === "ir") {
    const pupils: Point[] = [
      [249.6 + horizontal * 51.2, 201.6 + vertical * 51.2],
      [390.4 + horizontal * 51.2, 201.6 + vertical * 51.2],
    ]
    feature = buildIrFaceFeatures(geometry, pupils)?.feature ?? null
  } else {
    // Isolate measured eye evidence from the pretrained model's own behavior.
    feature = buildRgbFeatures(mode, geometry, [0.5, 0.5])
  }
  return {
    timestamp: 100,
    width: 640,
    height: 480,
    feature,
    quality: 1,
    reason: null,
    eyes: geometry.eyes,
    faceBox: geometry.faceBox,
    pose: geometry.pose,
    basePoint: [0.5, 0.5],
    method: "synthetic angular observations",
    processingMs: 0,
  }
}

function samples(mode: RemoteMode, moving = false): CalibrationSample[] {
  const result: CalibrationSample[] = []
  let targetId = 0
  for (const x of [0.1, 0.5, 0.9]) {
    for (const y of [0.1, 0.5, 0.9]) {
      const target: Point = [x, y]
      for (const distance of [2 / 3, 1, 20 / 13]) {
        const yaws = moving ? [-0.25, 0, 0.25] : [0]
        const positions = moving ? [-0.12, 0.12] : [0]
        for (const yaw of yaws) {
          for (const headX of positions) {
            result.push({
              target,
              targetId,
              observation: observation(mode, target, distance, yaw, headX),
            })
          }
        }
      }
      targetId++
    }
  }
  return result
}

for (const mode of ["webcam", "mobile", "ir"] as const) {
  describe(`${mode} perspective calibration`, () => {
    test("preserves a screen target across unseen viewing distances", () => {
      const fitted = fitRemoteCalibration(mode, samples(mode))
      expect(fitted).not.toBeNull()
      for (const distance of [0.8, 4 / 3]) {
        const predicted = predictRemoteGaze(
          fitted!,
          observation(mode, [0.25, 0.75], distance)
        )
        expect(predicted).not.toBeNull()
        expect(Math.abs(predicted![0] - 0.25)).toBeLessThan(0.005)
        expect(Math.abs(predicted![1] - 0.75)).toBeLessThan(0.005)
      }
    })

    test("separates yaw, lateral translation and distance with noisy repeated scales", () => {
      const fitted = fitRemoteCalibration(mode, samples(mode, true))
      expect(fitted).not.toBeNull()
      for (const distance of [0.8, 4 / 3]) {
        for (const yaw of [-0.12, 0.12]) {
          for (const scaleNoise of [-0.01, 0, 0, 0.01]) {
            const predicted = predictRemoteGaze(
              fitted!,
              observation(mode, [0.25, 0.75], distance, yaw, 0.03, scaleNoise)
            )
            expect(predicted).not.toBeNull()
            expect(Math.abs(predicted![0] - 0.25)).toBeLessThan(0.012)
            expect(Math.abs(predicted![1] - 0.75)).toBeLessThan(0.012)
          }
        }
      }
    })

    test("preserves finite gaze beyond the calibrated distance range with unsupported confidence", () => {
      const fitted = fitRemoteCalibration(mode, samples(mode))!
      const distant = observation(mode, [0.25, 0.75], 3)
      expect(poseSupported(fitted, distant.pose)).toBe(false)
      const predicted = predictRemoteGaze(fitted, distant)!
      expect(predicted.every(Number.isFinite)).toBe(true)
      expect(predicted[0]).toBeCloseTo(0.25, 2)
      expect(predicted[1]).toBeCloseTo(0.75, 2)
    })
  })
}

test("feature builders reject unusable face scale and severe foreshortening", () => {
  const geometry = inspectRgbFace(face(), 640, 480)
  if (!geometry.valid) {
    throw new Error(geometry.reason)
  }
  const pupils: Point[] = [
    [249.6, 201.6],
    [390.4, 201.6],
  ]
  for (const scale of [0, -0.1, 1e-9, NaN, Infinity]) {
    const invalid = {
      ...geometry,
      pose: { ...geometry.pose, scale },
    }
    expect(buildRgbFeatures("webcam", invalid, [0.5, 0.5])).toBeNull()
    expect(buildRgbFeatures("mobile", invalid, [0.5, 0.5])).toBeNull()
    expect(buildIrFaceFeatures(invalid, pupils)).toBeNull()
  }
  geometry.pose.yaw = Math.PI / 2
  expect(buildRgbFeatures("webcam", geometry, [0.5, 0.5])).toBeNull()
  expect(buildIrFaceFeatures(geometry, pupils)).toBeNull()
})
