import { expect, test } from "bun:test"
import { face } from "./face-fixture"
import { inspectRgbFace } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import {
  buildTrackingVectors,
  measureEyeMovement,
} from "../../apps/web/src/features/remote-eye-tracking/tracking-vectors"

function geometry(yaw = 0) {
  const result = inspectRgbFace(face(yaw), 640, 480)
  if (!result.valid) throw new Error(result.reason)
  return result
}

test("native head direction uses the actual rotation, independent of model input conventions", () => {
  const vectors = buildTrackingVectors(geometry(0.3))
  expect(vectors.face!.direction[0]).toBeCloseTo(Math.sin(0.3), 10)
  expect(vectors.face!.direction[1]).toBeCloseTo(0, 10)
  expect(vectors.face!.direction[2]).toBeCloseTo(Math.cos(0.3), 10)
  expect(Math.hypot(...vectors.face!.direction)).toBeCloseTo(1, 10)
  expect(vectors.rightEye!.side).toBe("right")
  expect(vectors.leftEye!.side).toBe("left")
  expect(vectors.rightEye!.source).toBe("iris-landmarks")
})

test("native pitch and combined yaw/roll project into image Y down exactly once", () => {
  const sample = geometry()
  sample.rotation = [
    [1, 0, 0],
    [0, Math.cos(0.2), -Math.sin(0.2)],
    [0, Math.sin(0.2), Math.cos(0.2)],
  ]
  expect(buildTrackingVectors(sample).face!.direction[1]).toBeCloseTo(
    Math.sin(0.2),
    10
  )
  const yaw = 0.3
  const roll = 0.4
  sample.rotation = [
    [
      Math.cos(roll) * Math.cos(yaw),
      -Math.sin(roll),
      Math.cos(roll) * Math.sin(yaw),
    ],
    [
      Math.sin(roll) * Math.cos(yaw),
      Math.cos(roll),
      Math.sin(roll) * Math.sin(yaw),
    ],
    [-Math.sin(yaw), 0, Math.cos(yaw)],
  ]
  const direction = buildTrackingVectors(sample).face!.direction
  expect(direction[0]).toBeCloseTo(Math.cos(roll) * Math.sin(yaw), 10)
  expect(direction[1]).toBeCloseTo(-Math.sin(roll) * Math.sin(yaw), 10)
  expect(direction[2]).toBeCloseTo(Math.cos(yaw), 10)
})

test("eye vectors are translation/scale invariant and retain different binocular movement", () => {
  const original = geometry()
  const centers = [
    [249.6 + 5.12, 201.6 - 2.56],
    [390.4 - 7.68, 201.6 + 1.28],
  ] as [number, number][]
  const first = buildTrackingVectors(original, centers, "ir-pupil")
  expect(first.rightEye!.camera[0]).toBeCloseTo(0.1, 10)
  expect(first.rightEye!.camera[1]).toBeCloseTo(-0.05, 10)
  expect(first.leftEye!.camera[0]).toBeCloseTo(-0.15, 10)
  expect(first.leftEye!.camera[1]).toBeCloseTo(0.025, 10)
  original.landmarks = original.landmarks.map(([x, y]) => [
    x * 1.7 + 23,
    y * 1.7 - 14,
  ])
  const transformedCenters = centers.map(
    ([x, y]) => [x * 1.7 + 23, y * 1.7 - 14] as [number, number]
  )
  const scaled = buildTrackingVectors(original, transformedCenters, "ir-pupil")
  for (const axis of [0, 1]) {
    expect(scaled.leftEye!.camera[axis]).toBeCloseTo(
      first.leftEye!.camera[axis],
      10
    )
    expect(scaled.rightEye!.camera[axis]).toBeCloseTo(
      first.rightEye!.camera[axis],
      10
    )
  }
})

test("a missing IR pupil retains the actual anatomical side rather than swapping eyes", () => {
  const sample = geometry()
  const partial = buildTrackingVectors(
    sample,
    [null, sample.eyes[1].center],
    "ir-pupil"
  )
  expect(partial.rightEye).toBeNull()
  expect(partial.leftEye!.side).toBe("left")
  expect(partial.leftEye!.source).toBe("ir-pupil")
  expect(partial.face).not.toBeNull()
  const absent = buildTrackingVectors(sample, [null, null], "ir-pupil")
  expect(absent.leftEye).toBeNull()
  expect(absent.rightEye).toBeNull()
})

test("camera movement uses each measured canthus basis rather than a single head-roll angle", () => {
  const sample = geometry()
  for (const [index, angle] of [
    [0, 0.45],
    [1, -0.25],
  ]) {
    const corners = index === 0 ? [33, 133] : [362, 263]
    const origin = sample.eyes[index].center
    for (const corner of corners) {
      const point = sample.landmarks[corner]
      const dx = point[0] - origin[0]
      const dy = point[1] - origin[1]
      sample.landmarks[corner] = [
        origin[0] + Math.cos(angle) * dx - Math.sin(angle) * dy,
        origin[1] + Math.sin(angle) * dx + Math.cos(angle) * dy,
      ]
    }
    const result = measureEyeMovement(
      sample.landmarks,
      index,
      [origin[0] + 5.12, origin[1] - 2.56],
      "ir-pupil"
    )!
    expect(result.camera[0]).toBeCloseTo(0.1, 10)
    expect(result.camera[1]).toBeCloseTo(-0.05, 10)
    expect(result.local[0]).toBeCloseTo(
      0.1 * Math.cos(angle) - 0.05 * Math.sin(angle),
      10
    )
  }
})

test("invalid landmarks, collapsed eyes and nonfinite rotation never become vectors", () => {
  const sample = geometry()
  sample.landmarks[133] = sample.landmarks[33]
  expect(
    measureEyeMovement(sample.landmarks, 0, sample.eyes[0].center, "ir-pupil")
  ).toBeNull()
  expect(measureEyeMovement([], 1, [1, 2], "ir-pupil")).toBeNull()
  expect(
    measureEyeMovement(sample.landmarks, 1, [NaN, 2], "ir-pupil")
  ).toBeNull()
  sample.rotation[0][2] = NaN
  expect(buildTrackingVectors(sample).face).toBeNull()
})
