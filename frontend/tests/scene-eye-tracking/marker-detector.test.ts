import { beforeAll, expect, test } from "bun:test"
import {
  MarkerDetector,
  markerSvg,
  type MarkerImage,
} from "../../apps/web/src/features/scene-eye-tracking/marker-detector"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"
import type { CV } from "../../apps/web/src/features/eye-tracking/opencv.types"

let cv: CV
beforeAll(async () => {
  cv = (await loadOpenCv()).cv
})
const scene = { id: 1, timestamp: 100, width: 400, height: 300, generation: 1 }
function blank(width = 400, height = 300): MarkerImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  return { width, height, data }
}
// Inverse project a physical circle, independently of detection and fitting.
function paint(
  image: MarkerImage,
  cx = 120,
  cy = 130,
  radius = 48,
  stretch = 1,
  angle = 0
) {
  const cos = Math.cos(angle),
    sin = Math.sin(angle)
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const dx = x - cx,
        dy = y - cy
      const r =
        Math.hypot((dx * cos + dy * sin) / stretch, -dx * sin + dy * cos) /
        radius
      if (r > 1.18) continue
      const value = r > 1 || (r < 0.62 && r > 0.26) ? 255 : 0
      const offset = (y * image.width + x) * 4
      image.data.fill(value, offset, offset + 3)
      if (r < 0.035) image.data[offset] = 225
    }
  return image
}
function blur(image: MarkerImage, kernel = 5): MarkerImage {
  const mat = cv.matFromImageData(image),
    out = new cv.Mat()
  try {
    cv.GaussianBlur(mat, out, new cv.Size(kernel, kernel), 1.7)
    return { ...image, data: new Uint8ClampedArray(out.data) }
  } finally {
    mat.delete()
    out.delete()
  }
}
function lighting(image: MarkerImage, low: number, high: number, gradient = 0) {
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4
      const shade = gradient * (x / image.width - 0.5)
      for (let channel = 0; channel < 3; channel++)
        image.data[offset + channel] =
          low + (image.data[offset + channel] / 255) * (high - low) + shade
    }
  return image
}
function assertCenter(image: MarkerImage, x: number, y: number, tolerance = 1) {
  const result = new MarkerDetector(cv).detect(image, scene)
  expect(result.position).not.toBeNull()
  expect(Math.abs(result.position![0] * image.width - x)).toBeLessThan(
    tolerance
  )
  expect(Math.abs(result.position![1] * image.height - y)).toBeLessThan(
    tolerance
  )
  expect(result.scene).toEqual(scene)
}
test("a broad-ring marker is localized in real raster pixels under blur and dim/bright uneven light", () => {
  for (const [low, high, gradient] of [
    [0, 255, 0],
    [25, 90, 35],
    [155, 245, 80],
    [70, 150, 110],
  ])
    assertCenter(lighting(blur(paint(blank())), low, high, gradient), 120, 130)
})
test("small and oblique circles retain their center at different image angles", () => {
  for (const angle of [0, Math.PI / 2, Math.PI / 3, -Math.PI / 3])
    assertCenter(
      blur(paint(blank(), 275, 190, 32, 0.55, angle), 3),
      275,
      190,
      1.5
    )
})
test("camera reflections and quarter-turns return coordinates in the displayed image axes", () => {
  const source = paint(blank()),
    reflected = blank(),
    rotated = blank(300, 400)
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4
      reflected.data.set(
        source.data.subarray(offset, offset + 4),
        (y * 400 + 399 - x) * 4
      )
      rotated.data.set(
        source.data.subarray(offset, offset + 4),
        (x * 300 + 299 - y) * 4
      )
    }
  assertCenter(reflected, 279, 130)
  assertCenter(rotated, 169, 120)
})
test("projective distortion uses the small center disc rather than the biased outer ellipse center", () => {
  const image = blank()
  // x=(100+200u+200v)/(1+v), y=(60+340v)/(1+v).
  // Physical center (0.5,0.5) projects to (200,153.333...).
  for (let y = 60; y < 200; y++)
    for (let x = 100; x < 300; x++) {
      const v = (y - 60) / (340 - y),
        u = (x * (1 + v) - 100 - 200 * v) / 200
      const r = Math.hypot(u - 0.5, v - 0.5) / 0.4
      if (r < 1 && (r > 0.62 || r < 0.26)) {
        const offset = (y * image.width + x) * 4
        image.data.fill(0, offset, offset + 3)
      }
    }
  assertCenter(blur(image, 3), 200, 460 / 3, 1.5)
})
test("the dominant physical marker remains usable with a smaller recursive preview copy", () => {
  assertCenter(paint(paint(blank(), 100, 140, 55), 300, 140, 20), 100, 140)
})
test("a preview copy cannot take over after the primary marker becomes unreadable", () => {
  const detector = new MarkerDetector(cv)
  expect(
    detector.detect(paint(paint(blank(), 100, 140, 55), 300, 140, 20), scene)
      .position
  ).not.toBeNull()
  const copyOnly = paint(blank(), 300, 140, 20)
  for (const timestamp of [150, 1000, 10000])
    expect(
      detector.detect(copyOnly, { ...scene, timestamp }).position
    ).toBeNull()
  expect(
    detector.detect(paint(blank(), 180, 160, 45), {
      ...scene,
      timestamp: 10100,
    }).position
  ).not.toBeNull()
  expect(
    detector.detect(copyOnly, { ...scene, generation: 2 }).position
  ).not.toBeNull()
})
test("equal references, clipped rings, occlusion, plain dots and very weak contrast cannot supply evidence", () => {
  const detector = new MarkerDetector(cv),
    occluded = paint(blank()),
    dot = blank()
  for (let y = 110; y < 140; y++)
    for (let x = 90; x < 170; x++) {
      const offset = (y * occluded.width + x) * 4
      occluded.data.fill(255, offset, offset + 3)
    }
  for (let y = 90; y < 170; y++)
    for (let x = 80; x < 160; x++)
      if (Math.hypot(x - 120, y - 130) < 30) {
        const offset = (y * dot.width + x) * 4
        dot.data.fill(0, offset, offset + 3)
      }
  for (const image of [
    blank(),
    dot,
    occluded,
    paint(blank(), 10, 130),
    paint(blank(), 100, 100, 9),
    lighting(paint(blank()), 100, 108),
    paint(paint(blank(), 100, 140), 300, 140, 40),
  ])
    expect(detector.detect(image, scene).position).toBeNull()
})
test("download and on-page marker share a simple high-contrast pattern with a quiet zone", () => {
  const svg = markerSvg()
  expect(svg).toContain('viewBox="0 0 100 100"')
  expect(svg.match(/<circle/g)).toHaveLength(4)
  expect(svg).toContain('fill="white"')
  expect(svg).toContain('fill="black"')
  expect(svg).toContain('fill="#e11d48"')
})
test("invalid camera pixels are rejected instead of becoming a target", () => {
  expect(() =>
    new MarkerDetector(cv).detect(
      { width: 5, height: 5, data: new Uint8ClampedArray(3) },
      scene
    )
  ).toThrow(/unreadable/)
})
