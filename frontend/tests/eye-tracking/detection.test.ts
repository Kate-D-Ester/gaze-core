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
