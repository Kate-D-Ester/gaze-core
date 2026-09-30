import { beforeAll, expect, test } from "bun:test"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"
import {
  buildIrFeatures,
  detectIrEye,
  type IrReference,
} from "../../apps/web/src/features/remote-eye-tracking/ir-features"
import type { Point } from "../../apps/web/src/features/remote-eye-tracking/types"

let cv: Awaited<ReturnType<typeof loadOpenCv>>["cv"]
beforeAll(async () => {
  cv = (await loadOpenCv()).cv
})
const width = 320,
  height = 240
function eye(
  pupil: Point = [160, 120],
  glint: Point | null = [154, 114],
  scale = 1,
  glintRadius = 3
) {
  const data = new Uint8Array(width * height).fill(175)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (
        (x - pupil[0]) ** 2 / (30 * scale) ** 2 +
          (y - pupil[1]) ** 2 / (23 * scale) ** 2 <=
        1
      )
        data[y * width + x] = 25
      if (
        glint &&
        (x - glint[0]) ** 2 + (y - glint[1]) ** 2 <= (glintRadius * scale) ** 2
      )
        data[y * width + x] = 252
    }
  return data
}
function measure(
  data: Uint8Array,
  timestamp = 0,
  reference: IrReference | null = null,
  threshold = 0
) {
  return detectIrEye(cv, data, width, height, threshold, timestamp, reference)
}
function features(data: Uint8Array) {
  const result = measure(data)
  expect(result.pupil).not.toBeNull()
  expect(result.glint).not.toBeNull()
  return buildIrFeatures(result.pupil!, result.glint!, width, height)
}

test("joint pupil/glint translation preserves displacement while updating the observed reference", () => {
  const a = features(eye()),
    b = features(eye([185, 132], [179, 126]))
  expect(a.feature.length).toBeLessThanOrEqual(24)
  expect(b.feature[0]).toBeCloseTo(a.feature[0], 1)
  expect(b.feature[1]).toBeCloseTo(a.feature[1], 1)
  expect(b.pose.x - a.pose.x).toBeCloseTo(25 / 320, 2)
  expect(b.pose.y - a.pose.y).toBeCloseTo(12 / 240, 2)
  expect(b.pose.kind).toBe("eye-reference")
  expect([b.pose.yaw, b.pose.pitch, b.pose.roll]).toEqual([null, null, null])
})

test("apparent distance change preserves scale-normalized displacement and updates pupil scale", () => {
  const a = features(eye()),
    b = features(eye([160, 120], [151, 111], 1.5))
  expect(b.feature[0]).toBeCloseTo(a.feature[0], 1)
  expect(b.feature[1]).toBeCloseTo(a.feature[1], 1)
  expect(b.pose.scale / a.pose.scale).toBeCloseTo(1.5, 1)
})

test("pupil motion with a stationary glint changes gaze features", () => {
  const a = features(eye()),
    b = features(eye([170, 124], [154, 114]))
  expect(b.feature[0] - a.feature[0]).toBeGreaterThan(0.3)
  expect(b.feature[1] - a.feature[1]).toBeGreaterThan(0.1)
  expect(b.pose.x).toBeCloseTo(a.pose.x, 3)
  expect(b.pose.y).toBeCloseTo(a.pose.y, 3)
})

test("a current glint is required even after a successful prior frame", () => {
  const first = measure(eye(), 0)
  expect(first.reference).not.toBeNull()
  const lost = measure(eye([162, 120], null), 40, first.reference)
  expect(lost.pupil).not.toBeNull()
  expect(lost.glint).toBeNull()
  expect(lost.reference).toBeNull()
  expect(lost.quality).toBe(0)
})

test("broad reflections are rejected rather than labeled corneal glints", () => {
  const result = measure(eye([160, 120], [152, 114], 1, 11))
  expect(result.glint).toBeNull()
  expect(result.reference).toBeNull()
})

test("unrelated bright specks away from the pupil cannot supply a reference", () => {
  const result = measure(eye([160, 120], [240, 60]))
  expect(result.glint).toBeNull()
})

test("a closed eye or missing pupil with a bright speck produces no IR reference", () => {
  const data = new Uint8Array(width * height).fill(175)
  for (let y = 108; y <= 112; y++)
    for (let x = 110; x < 210; x++) data[y * width + x] = 25
  for (let y = 117; y <= 123; y++)
    for (let x = 151; x <= 157; x++) data[y * width + x] = 252
  const result = measure(data)
  expect(result.pupil).toBeNull()
  expect(result.glint).toBeNull()
})

test("multiple equally plausible initial reflections require an unambiguous reference", () => {
  const data = eye([160, 120], [154, 114])
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((x - 166) ** 2 + (y - 126) ** 2 <= 3 ** 2) data[y * width + x] = 252
  expect(measure(data).glint).toBeNull()
})

test("recent glint association follows head translation despite a new competing highlight", () => {
  const first = measure(eye(), 0)
  const data = eye([180, 130], [174, 124])
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((x - 187) ** 2 + (y - 137) ** 2 <= 3 ** 2) data[y * width + x] = 252
  const next = measure(data, 40, first.reference)
  expect(next.glint).not.toBeNull()
  expect(next.glint![0]).toBeCloseTo(174, 1)
  expect(next.glint![1]).toBeCloseTo(124, 1)
  expect(measure(data, 700, first.reference).glint).toBeNull()
})

test("the threshold setting is an absolute pupil cutoff, with zero selecting auto", () => {
  expect(measure(eye(), 0, null, 15).pupil).toBeNull()
  expect(measure(eye(), 0, null, 60).glint).not.toBeNull()
  expect(measure(eye()).glint).not.toBeNull()
})

test("invalid image dimensions do not call detection or return stale measurements", () => {
  const result = detectIrEye(cv, new Uint8Array(10), width, height, 0, 40)
  expect(result.pupil).toBeNull()
  expect(result.glint).toBeNull()
  expect(result.reference).toBeNull()
})
