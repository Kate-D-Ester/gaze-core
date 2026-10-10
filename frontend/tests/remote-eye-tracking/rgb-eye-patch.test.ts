import { describe, expect, test } from "bun:test"
import * as crop from "../../apps/web/src/features/remote-eye-tracking/rgb-eye-patch"
import { extractRgbEyePatch } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import type {
  Point,
  Rect,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import type { RgbPixels } from "../../apps/web/src/features/remote-eye-tracking/rgb-features.types"
import { face } from "./face-fixture"
import { referenceRgbEyePatch } from "./rgb-eye-patch-reference"

function landmarks(width: number, height: number) {
  return face().faceLandmarks[0].map(
    ({ x, y }) => [x * width, y * height] as Point
  )
}

function coordinateFrame(width: number, height: number): RgbPixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      data.set([x & 255, x >> 8, y & 255, y >> 8], index)
    }
  }
  return { width, height, data }
}

function readRect(frame: RgbPixels, rect: Rect) {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * frame.width + rect.x) * 4
    data.set(
      frame.data.subarray(start, start + rect.width * 4),
      y * rect.width * 4
    )
  }
  return { width: rect.width, height: rect.height, data }
}

describe("RGB eye crop readback", () => {
  test("samples the original rounded eye band with integer crop origins", () => {
    const plan = crop.createRgbEyePatchPlan(640, 480, landmarks(640, 480))
    const rect = plan.sourceRect!
    const patch = crop.sampleRgbEyePatch(
      readRect(coordinateFrame(640, 480), rect),
      plan,
      [rect.x, rect.y]
    )
    // Original padded corner (122.6,96), band start 142: floor y=167.
    expect([...patch.data.subarray(0, 4)]).toEqual([122, 0, 167, 0])
    // At output (511,127), original warp y=272: floor (515.23,233.7).
    const last = (512 * 128 - 1) * 4
    expect([...patch.data.subarray(last, last + 4)]).toEqual([3, 2, 233, 0])
  })

  for (const [width, height] of [
    [640, 480],
    [1280, 720],
    [1920, 1080],
    [480, 640],
  ]) {
    for (const pose of [
      "neutral",
      "affine",
      "projective",
      "left-border",
      "top-border",
      "right-border",
      "bottom-border",
    ]) {
      test(`${width}x${height} ${pose} preserves every baseline RGBA byte with cropped reads`, () => {
        const frame = coordinateFrame(width, height)
        let points = landmarks(width, height)
        if (pose === "affine")
          points = points.map(([x, y]) => [
            x + y * 0.08 + 0.49,
            y - x * 0.03 + 0.51,
          ])
        if (pose === "projective")
          points = points.map(([x, y]) => {
            const w = 1 + x * 0.00018 - y * 0.00007
            return [(x + y * 0.06) / w, (y - x * 0.03) / w]
          })
        if (pose === "left-border")
          points = points.map(([x, y]) => [x - width * 0.3, y])
        if (pose === "top-border")
          points = points.map(([x, y]) => [x, y - height * 0.4])
        if (pose === "right-border")
          points = points.map(([x, y]) => [x + width * 0.3, y])
        if (pose === "bottom-border")
          points = points.map(([x, y]) => [x, y + height * 0.6])
        const expected = referenceRgbEyePatch(frame, points)
        const plan = crop.createRgbEyePatchPlan(width, height, points)
        const rect = plan.sourceRect!
        expect(
          Number.isInteger(rect.x + rect.y + rect.width + rect.height)
        ).toBe(true)
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.y).toBeGreaterThanOrEqual(0)
        expect(rect.x + rect.width).toBeLessThanOrEqual(width)
        expect(rect.y + rect.height).toBeLessThanOrEqual(height)
        expect(rect.width * rect.height).toBeLessThan(width * height * 0.5)
        // Decode independently sampled full-frame pixels to prove none are omitted.
        for (let i = 0; i < expected.data.length; i += 4) {
          const x = expected.data[i] + expected.data[i + 1] * 256
          const y = expected.data[i + 2] + expected.data[i + 3] * 256
          if (x === 0 && y === 0) continue // Transparent black padding or pixel (0,0).
          if (
            x < rect.x ||
            x >= rect.x + rect.width ||
            y < rect.y ||
            y >= rect.y + rect.height
          ) {
            throw new Error(
              `Baseline sampled (${x},${y}) outside readback bounds`
            )
          }
        }
        expect(
          crop.sampleRgbEyePatch(readRect(frame, rect), plan, [rect.x, rect.y])
        ).toEqual(expected)
        expect(extractRgbEyePatch(frame, points)).toEqual(expected)
      })
    }
  }

  test("keeps fully out-of-frame strips transparent black without requiring readback", () => {
    const points = landmarks(640, 480).map(([x, y]) => [x - 2000, y] as Point)
    const plan = crop.createRgbEyePatchPlan(640, 480, points)
    expect(plan.sourceRect).toBeNull()
    expect(crop.sampleRgbEyePatch(null, plan).data).toEqual(
      new Uint8ClampedArray(512 * 128 * 4)
    )
  })

  test("rejects invalid dimensions, nonfinite landmarks, singular crops, and invalid eye bands", () => {
    const points = landmarks(640, 480)
    expect(() => crop.createRgbEyePatchPlan(0, 480, points)).toThrow()
    expect(() => crop.createRgbEyePatchPlan(640.5, 480, points)).toThrow()
    expect(() => crop.createRgbEyePatchPlan(640, 480, [])).toThrow()
    for (const index of [4, 103, 150, 151, 195, 332, 379]) {
      const invalid = points.map((p) => [...p] as Point)
      invalid[index][0] = NaN
      expect(() => crop.createRgbEyePatchPlan(640, 480, invalid)).toThrow()
    }
    const singular = points.map(() => [10, 10] as Point)
    expect(() => crop.createRgbEyePatchPlan(640, 480, singular)).toThrow()
    points[195] = points[151]
    expect(() => crop.createRgbEyePatchPlan(640, 480, points)).toThrow()
  })

  test("rejects a finite inverse mapping whose projective horizon crosses the strip", () => {
    const points = Array.from({ length: 478 }, () => [320, 240] as Point)
    points[103] = [420, 340]
    points[150] = [420, 640]
    points[379] = [220, -160]
    points[332] = [220, 140]
    points[151] = [420, 380]
    points[195] = [420, 420]
    expect(() => crop.createRgbEyePatchPlan(640, 480, points)).toThrow(
      "projective horizon"
    )
  })

  test("rejects truncated buffers, partial source coverage, and fractional crop origins", () => {
    const plan = crop.createRgbEyePatchPlan(640, 480, landmarks(640, 480))
    const rect = plan.sourceRect!
    const frame = readRect(coordinateFrame(640, 480), rect)
    expect(() =>
      crop.sampleRgbEyePatch(frame, plan, [rect.x + 0.5, rect.y])
    ).toThrow()
    expect(() =>
      crop.sampleRgbEyePatch({ ...frame, data: frame.data.subarray(4) }, plan, [
        rect.x,
        rect.y,
      ])
    ).toThrow()
    expect(() =>
      crop.sampleRgbEyePatch(frame, plan, [rect.x + 1, rect.y])
    ).toThrow()
    expect(() => crop.sampleRgbEyePatch(null, plan)).toThrow()
  })
})
