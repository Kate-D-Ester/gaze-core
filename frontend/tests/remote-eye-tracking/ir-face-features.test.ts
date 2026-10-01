import { expect, test } from "bun:test"
import { inspectRgbFace } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import {
  buildIrFaceFeatures,
  irEyeRegions,
  irEyeSearchBounds,
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

test("valid iris geometry bounds the pupil search without supplying gaze coordinates", () => {
  const g = geometry()
  const bounds = irEyeSearchBounds(g, 0)
  expect(bounds).not.toBeNull()
  expect(bounds!.center).toEqual(g.landmarks[468])
  expect(bounds!.maxRadius).toBeLessThanOrEqual(g.eyes[0].radius * 1.25)
  const actual = pupils(3, 1)
  expect(buildIrFaceFeatures(g, actual)!.feature[0]).not.toEqual(
    buildIrFaceFeatures(g, pupils())!.feature[0]
  )
})
test("invalid or off-aperture IR iris predictions leave the raw eye-opening search available", () => {
  const g = geometry()
  g.landmarks[468] = [0, 0]
  expect(irEyeSearchBounds(g, 0)).toBeNull()
  g.landmarks[468] = [NaN, 201.6]
  expect(irEyeSearchBounds(g, 0)).toBeNull()
})

test("collapsed or one-sided iris rings cannot constrain the raw pupil search", () => {
  const g = geometry()
  g.landmarks[468] = [257.6, 201.6]
  for (let i = 469; i <= 472; i++) g.landmarks[i] = [262.72, 201.6]
  expect(irEyeSearchBounds(g, 0)).toBeNull()
})

test("collinear opposed iris points cannot narrow the real pupil search", () => {
  const g = geometry()
  g.landmarks[468] = [257.6, 201.6]
  g.landmarks[469] = g.landmarks[470] = [262.72, 201.6]
  g.landmarks[471] = g.landmarks[472] = [252.48, 201.6]
  expect(irEyeSearchBounds(g, 0)).toBeNull()
})
