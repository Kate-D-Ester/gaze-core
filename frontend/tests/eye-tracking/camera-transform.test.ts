import { expect, test } from "bun:test"
import {
  cameraFrameGeometry,
  normalizeCameraTransform,
} from "../../apps/web/src/features/eye-tracking/camera-transform"

test("clockwise rotation preserves the full frame and swaps landscape dimensions", () => {
  const frame = cameraFrameGeometry(640, 480, {
    rotation: 90,
    mirrorX: false,
    mirrorY: false,
  })
  expect([frame.width, frame.height]).toEqual([480, 640])
  const [a, b, c, d, e, f] = frame.matrix
  expect(a).toBeCloseTo(0)
  expect(b).toBeCloseTo(1)
  expect(c).toBeCloseTo(-1)
  expect(d).toBeCloseTo(0)
  expect(e).toBeCloseTo(480)
  expect(f).toBeCloseTo(0)
})

test("mirroring operates in the visible frame axes after rotation", () => {
  const frame = cameraFrameGeometry(640, 480, {
    rotation: 90,
    mirrorX: true,
    mirrorY: false,
  })
  const [a, b, c, d, e, f] = frame.matrix
  expect(a).toBeCloseTo(0)
  expect(b).toBeCloseTo(1)
  expect(c).toBeCloseTo(1)
  expect(d).toBeCloseTo(0)
  expect(e).toBeCloseTo(0)
  expect(f).toBeCloseTo(0)
})

test("an arbitrary camera angle expands the canvas instead of cropping corners", () => {
  const frame = cameraFrameGeometry(100, 50, {
    rotation: 30,
    mirrorX: false,
    mirrorY: false,
  })
  expect([frame.width, frame.height]).toEqual([112, 94])
  const [a, b, c, d, e, f] = frame.matrix
  for (const [x, y] of [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ]) {
    const px = a * x + c * y + e
    const py = b * x + d * y + f
    expect(px).toBeGreaterThanOrEqual(0)
    expect(px).toBeLessThanOrEqual(112)
    expect(py).toBeGreaterThanOrEqual(0)
    expect(py).toBeLessThanOrEqual(94)
  }
})

test("camera angles wrap consistently and reject nonfinite input", () => {
  expect(
    normalizeCameraTransform({ rotation: -90, mirrorX: true, mirrorY: false })
  ).toEqual({ rotation: 270, mirrorX: true, mirrorY: false })
  expect(
    normalizeCameraTransform({
      rotation: Infinity,
      mirrorX: false,
      mirrorY: false,
    }).rotation
  ).toBe(0)
})
