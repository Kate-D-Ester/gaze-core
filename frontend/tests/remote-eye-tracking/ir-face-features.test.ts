import { expect, test } from "bun:test"
import { inspectRgbFace } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import {
  buildIrFaceFeatures,
  irEyeRegions,
} from "../../apps/web/src/features/remote-eye-tracking/ir-face-features"
import { face } from "./face-fixture"
function geometry(result = face(), width = 640, height = 480) {
  const value = inspectRgbFace(result, width, height)
  if (!value.valid) throw new Error(value.reason)
  return value
}
function pupils(dx = 0, dy = 0) {
  return [
    [249.6 + dx, 201.6 + dy],
    [390.4 + dx, 201.6 + dy],
  ] as [number, number][]
}
test("IR pupil motion produces gaze inputs without depending on inferred iris centers", () => {
  const g = geometry(),
    a = buildIrFaceFeatures(g, pupils())!,
    b = buildIrFaceFeatures(g, pupils(5, 2))!
  expect(a.feature).not.toEqual(b.feature)
  expect(b.feature[0] - a.feature[0]).toBeCloseTo(5 / 51.2, 5)
  expect(b.feature[1] - a.feature[1]).toBeCloseTo(2 / 51.2, 5)
  expect(b.pose).toEqual(a.pose)
})
test("IR eye offsets remain invariant under camera translation and resolution changes", () => {
  const original = geometry(),
    doubled = geometry(face(), 1280, 960)
  const a = buildIrFaceFeatures(original, pupils())!,
    b = buildIrFaceFeatures(
      doubled,
      pupils().map(([x, y]) => [x * 2, y * 2])
    )!
  expect(b.feature).toEqual(a.feature)
  const shifted = face()
  for (const point of shifted.faceLandmarks[0]) {
    point.x += 0.03
    point.y += 0.02
  }
  const c = buildIrFaceFeatures(
    geometry(shifted),
    pupils().map(([x, y]) => [x + 19.2, y + 9.6])
  )!
  for (let i = 0; i < 4; i++) expect(c.feature[i]).toBeCloseTo(a.feature[i], 8)
  expect(c.pose.x - a.pose.x).toBeCloseTo(0.03)
})
test("IR calibration retains head rotation independently from pupil movement", () => {
  const a = buildIrFaceFeatures(geometry(), pupils())!,
    b = buildIrFaceFeatures(geometry(face(0.3)), pupils())!
  expect(b.pose.yaw).toBeCloseTo(0.3)
  expect(b.feature).not.toEqual(a.feature)
  expect(buildIrFaceFeatures(geometry(), [[249.6, 201.6]])).toBeNull()
  expect(
    buildIrFaceFeatures(geometry(), [
      [NaN, 201.6],
      [390.4, 201.6],
    ])
  ).toBeNull()
})
test("automatic IR crops contain both eye corners while preserving source pixel dimensions", () => {
  const boxes = irEyeRegions(geometry(), 640, 480)
  expect(boxes).toHaveLength(2)
  expect(boxes[0].x).toBeLessThan(224)
  expect(boxes[0].x + boxes[0].width).toBeGreaterThan(275.2)
  expect(boxes[0].height).toBeGreaterThanOrEqual(24)
  const large = irEyeRegions(geometry(face(), 1920, 1440), 1920, 1440)
  expect(large[0].width).toBeGreaterThan(150)
})
