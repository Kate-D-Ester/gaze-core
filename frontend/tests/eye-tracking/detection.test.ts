import { beforeAll, expect, test } from "bun:test"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"
import {
  detectSpatialPupil,
  refineContour,
} from "../../apps/web/src/features/eye-tracking/detection"
import type { Point } from "../../apps/web/src/features/eye-tracking/types"
let cv: Awaited<ReturnType<typeof loadOpenCv>>["cv"]
beforeAll(async () => {
  cv = (await loadOpenCv()).cv
})
function frame(angle = 0.55, glint = false) {
  const width = 320,
    height = 240,
    data = new Uint8Array(width * height).fill(170),
    c = Math.cos(angle),
    s = Math.sin(angle)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = x - 158,
        dy = y - 117,
        u = dx * c + dy * s,
        v = -dx * s + dy * c
      if ((u * u) / 36 ** 2 + (v * v) / 23 ** 2 <= 1) data[y * width + x] = 20
      if (glint && (x - 152) ** 2 + (y - 113) ** 2 < 3 ** 2)
        data[y * width + x] = 250
    }
  return data
}
test("real OpenCV fits an unequal rotated ellipse and preserves threshold previews", () => {
  const result = detectSpatialPupil(cv, frame(), 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(result.previews).toHaveLength(3)
  expect(result.ellipse!.center[0]).toBeCloseTo(158, 0)
  expect(result.ellipse!.center[1]).toBeCloseTo(117, 0)
  expect(result.ellipse!.major).toBeGreaterThan(result.ellipse!.minor * 1.3)
  expect(Math.abs(Math.sin(result.ellipse!.angle - 0.55))).toBeLessThan(0.08)
  expect(result.ellipse!.confidence).toBeGreaterThan(0.85)
})
test("a small specular highlight does not displace the pupil center", () => {
  const result = detectSpatialPupil(cv, frame(0.55, true), 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 158, result.ellipse!.center[1] - 117)
  ).toBeLessThan(2)
})
test("uniform frames and clipped blobs return no pupil", () => {
  for (const value of [0, 20, 170, 255])
    expect(
      detectSpatialPupil(cv, new Uint8Array(320 * 240).fill(value), 320, 240, 0)
        .ellipse
    ).toBeNull()
  const data = new Uint8Array(320 * 240).fill(180)
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 80; x++) data[y * 320 + x] = 10
  expect(detectSpatialPupil(cv, data, 320, 240, 0).ellipse).toBeNull()
})
test("inward contour test is invariant to translation and scaling", () => {
  const points: Point[] = Array.from({ length: 100 }, (_, i) => [
    30 * Math.cos((i * 2 * Math.PI) / 100),
    20 * Math.sin((i * 2 * Math.PI) / 100),
  ])
  const a = refineContour(points),
    b = refineContour(points.map(([x, y]) => [10 * x + 500, 10 * y + 1000]))
  expect(a.length).toBe(points.length)
  expect(b.length).toBe(a.length)
  expect(
    refineContour([
      [0, 0],
      [0, 0],
      [0, 0],
    ])
  ).toEqual([])
})

function movingEye(cx: number, cy: number, pupilValue = 45, lash = true) {
  const data = new Uint8Array(320 * 240).fill(185)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if (lash && x > 12 && x < 305 && y > 8 && y < 24) data[y * 320 + x] = 5
      if ((x - cx) ** 2 / 17 ** 2 + (y - cy) ** 2 / 11 ** 2 <= 1)
        data[y * 320 + x] = pupilValue
    }
  return data
}
test("a darker eyelash does not limit pupil detection to one corner of the ROI", () => {
  for (const [x, y] of [
    [45, 65],
    [160, 65],
    [275, 65],
    [45, 185],
    [160, 185],
    [275, 185],
  ]) {
    const result = detectSpatialPupil(cv, movingEye(x, y), 320, 240, 0)
    expect(result.ellipse).not.toBeNull()
    expect(
      Math.hypot(result.ellipse!.center[0] - x, result.ellipse!.center[1] - y)
    ).toBeLessThan(2)
  }
})
test("candidate selection stays with the pupil when a larger dark reflection distractor exists", () => {
  const data = movingEye(225, 160, 45, false)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if ((x - 65) ** 2 / 33 ** 2 + (y - 65) ** 2 / 23 ** 2 <= 1)
        data[y * 320 + x] = 5
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous: {
      center: [222, 160],
      major: 17,
      minor: 11,
      angle: 0,
      confidence: 0.95,
    },
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 225, result.ellipse!.center[1] - 160)
  ).toBeLessThan(2)
})
test("manual threshold is the displayed absolute grayscale cutoff", () => {
  const data = movingEye(160, 120, 65, false)
  const low = detectSpatialPupil(cv, data, 320, 240, 40, {
    thresholdMode: "manual",
  })
  expect(low.ellipse).toBeNull()
  const high = detectSpatialPupil(cv, data, 320, 240, 90, {
    thresholdMode: "manual",
  })
  expect(high.ellipse).not.toBeNull()
  expect(high.previews).toHaveLength(1)
  expect(high.previews[0].threshold).toBe(90)
  expect(high.ellipse!.major).toBeCloseTo(17, 0)
})

test("automatic thresholds select the pupil rather than the enclosing iris", () => {
  const data = new Uint8Array(320 * 240).fill(200)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      const q = (x - 160) ** 2 / 44 ** 2 + (y - 120) ** 2 / 35 ** 2
      if (q <= 1) data[y * 320 + x] = 100
      if ((x - 160) ** 2 / 20 ** 2 + (y - 120) ** 2 / 16 ** 2 <= 1)
        data[y * 320 + x] = 20
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(Math.abs(result.ellipse!.major - 20)).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.minor - 16)).toBeLessThan(1)
})
