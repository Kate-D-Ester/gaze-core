import { beforeAll, expect, test } from "bun:test"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"
import {
  detectSpatialPupil,
  refineContour,
} from "../../apps/web/src/features/eye-tracking/detection"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
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
test("preview masks can be skipped without changing pupil detection", () => {
  const data = frame()
  const withMasks = detectSpatialPupil(cv, data, 320, 240, 0)
  const withoutMasks = detectSpatialPupil(cv, data, 320, 240, 0, {
    includePreviewMasks: false,
  })
  expect(withoutMasks.ellipse).toEqual(withMasks.ellipse)
  expect(withoutMasks.selected).toBe(withMasks.selected)
  expect(withoutMasks.previews.map((preview) => preview.threshold)).toEqual(
    withMasks.previews.map((preview) => preview.threshold)
  )
  expect(withMasks.previews.every((preview) => !!preview.mask)).toBe(true)
  expect(withoutMasks.previews.every((preview) => !preview.mask)).toBe(true)
})
test("preview visibility does not change threshold selection or exceed the comparison budget", () => {
  const previous = {
    center: [158, 117] as Point,
    major: 36,
    minor: 23,
    angle: 0.55,
    confidence: 0.99,
  }
  const countContours = () => {
    let calls = 0
    const instrumented = new Proxy(cv, {
      get(target, property) {
        const value = Reflect.get(target, property, target)
        if (property === "findContours")
          return (...args: unknown[]) => {
            calls++
            return value.apply(target, args)
          }
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    return { cv: instrumented, calls: () => calls }
  }
  const complete = countContours()
  const fast = countContours()
  const fullResult = detectSpatialPupil(complete.cv, frame(), 320, 240, 0, {
    previous,
    previousSelected: 1,
    includePreviewMasks: true,
  })
  const fastResult = detectSpatialPupil(fast.cv, frame(), 320, 240, 0, {
    previous,
    previousSelected: 1,
    includePreviewMasks: false,
  })

  expect(complete.calls()).toBeLessThanOrEqual(4)
  expect(fast.calls()).toBeLessThanOrEqual(4)
  expect(fastResult.selected).toBe(fullResult.selected)
  expect(fastResult.ellipse?.center[0]).toBeCloseTo(
    fullResult.ellipse!.center[0],
    1
  )
  expect(fastResult.ellipse?.center[1]).toBeCloseTo(
    fullResult.ellipse!.center[1],
    1
  )
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

test("an edge-connected glint does not pull the ellipse away from the pupil rim", () => {
  const data = new Uint8Array(320 * 240).fill(180)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 50 ** 2 + (y - 120) ** 2 / 45 ** 2 <= 1)
        data[y * 320 + x] = 80
      if (
        (x - 152) ** 2 + (y - 161) ** 2 < 14 ** 2 ||
        (x - 172) ** 2 + (y - 161) ** 2 < 12 ** 2
      )
        data[y * 320 + x] = 245
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 110, {
    thresholdMode: "manual",
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 160, result.ellipse!.center[1] - 120)
  ).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 50)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 45)).toBeLessThan(2)
  expect(result.ellipse!.confidence).toBeGreaterThanOrEqual(0.82)
})

test("a crescent with most of the pupil missing cannot become a confident eye", () => {
  const data = new Uint8Array(320 * 240).fill(180)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 50 ** 2 + (y - 120) ** 2 / 45 ** 2 <= 1)
        data[y * 320 + x] = 80
      if ((x - 180) ** 2 + (y - 120) ** 2 < 48 ** 2) data[y * 320 + x] = 245
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 110, {
    thresholdMode: "manual",
  })
  expect(result.ellipse?.confidence ?? 0).toBeLessThan(0.82)
})

test("auto preview keeps its previous threshold when candidates are equivalent or lost", () => {
  const options = { previousSelected: 2 }
  const found = detectSpatialPupil(cv, frame(), 320, 240, 0, options)
  expect(found.ellipse).not.toBeNull()
  expect(found.selected).toBe(2)
  const lost = detectSpatialPupil(
    cv,
    new Uint8Array(320 * 240).fill(180),
    320,
    240,
    0,
    options
  )
  expect(lost.ellipse).toBeNull()
  expect(lost.selected).toBe(2)
})

function shadedPupil(
  width: number,
  height: number,
  center: Point,
  major: number,
  minor: number,
  background: (x: number, y: number) => number = () => 185,
  contrast = 130
) {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside =
        ((x - center[0]) / major) ** 2 + ((y - center[1]) / minor) ** 2 <= 1
      data[y * width + x] = Math.max(
        0,
        Math.round(background(x, y) - (inside ? contrast : 0))
      )
    }
  return data
}

test("auto fits the whole pupil across an illumination gradient in one frame", () => {
  const data = shadedPupil(
    320,
    240,
    [180, 120],
    50,
    30,
    (x) => 40 + 0.65 * x,
    35
  )
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 180, result.ellipse!.center[1] - 120)
  ).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 50)).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.minor - 30)).toBeLessThan(3)
})

test("a wide pupil that fits a shallow ROI is not rejected by its major axis", () => {
  const result = detectSpatialPupil(
    cv,
    shadedPupil(240, 100, [120, 50], 70, 30),
    240,
    100,
    0
  )
  expect(result.ellipse).not.toBeNull()
  expect(Math.abs(result.ellipse!.major - 70)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 30)).toBeLessThan(2)
})

test("lash cleanup preserves a small pupil in a large eye ROI", () => {
  const result = detectSpatialPupil(
    cv,
    shadedPupil(960, 720, [480, 360], 6, 4),
    960,
    720,
    0
  )
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 480, result.ellipse!.center[1] - 360)
  ).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.major - 6)).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.minor - 4)).toBeLessThan(1)
})

test("visible pupil arcs survive connection to a dark eyelid at the ROI border", () => {
  const data = shadedPupil(320, 240, [160, 85], 27, 21)
  for (let y = 20; y <= 74; y++) data.fill(35, y * 320, (y + 1) * 320)
  const result = detectSpatialPupil(cv, data, 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 160, result.ellipse!.center[1] - 85)
  ).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.major - 27)).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.minor - 21)).toBeLessThan(3)
})

test("a stronger pupil can win after movement while a weak oval remains nearby", () => {
  const data = shadedPupil(320, 240, [245, 140], 19, 13)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if (((x - 100) / 19) ** 2 + ((y - 120) / 13) ** 2 <= 1)
        data[y * 320 + x] = 172
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous: {
      center: [100, 120],
      major: 19,
      minor: 13,
      angle: 0,
      confidence: 0.95,
    },
    previousSelected: 2,
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 245, result.ellipse!.center[1] - 140)
  ).toBeLessThan(2)
})

test("a closed eyelid and crossing lash strands do not produce a pupil", () => {
  const data = new Uint8Array(320 * 240).fill(180)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if (
        Math.abs(y - (90 + 0.0008 * (x - 160) ** 2)) < 4 ||
        (y > 60 &&
          y < 135 &&
          (Math.abs(x - 100 - 0.4 * y) < 2 || Math.abs(x - 210 + 0.3 * y) < 2))
      )
        data[y * 320 + x] = 15
  const result = detectSpatialPupil(cv, data, 320, 240, 0)
  expect(result.ellipse).toBeNull()
})

test("a clipped pupil is reconstructed only when enough visible rim remains", () => {
  const visible = detectSpatialPupil(
    cv,
    shadedPupil(180, 140, [90, 14], 28, 20),
    180,
    140,
    0
  )
  expect(visible.ellipse).not.toBeNull()
  expect(
    Math.hypot(visible.ellipse!.center[0] - 90, visible.ellipse!.center[1] - 14)
  ).toBeLessThan(3)
  const hidden = detectSpatialPupil(
    cv,
    shadedPupil(180, 140, [90, -12], 28, 20),
    180,
    140,
    0
  )
  expect(hidden.ellipse?.confidence ?? 0).toBeLessThan(0.82)
})

test("current pupil evidence wins over a previously selected enclosing iris mask", () => {
  const data = shadedPupil(320, 240, [160, 120], 29, 23, () => 185, 105)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if (((x - 160) / 20) ** 2 + ((y - 120) / 16) ** 2 <= 1)
        data[y * 320 + x] = 65
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous: {
      center: [160, 120],
      major: 20,
      minor: 16,
      angle: 0,
      confidence: 0.95,
    },
    previousSelected: 2,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(Math.abs(result.ellipse!.major - 20)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 16)).toBeLessThan(2)
})

test("lighting gradients without a pupil do not become detections", () => {
  for (const background of [
    (x: number, y: number) => 25 + x * 0.6 + y * 0.1,
    (x: number, y: number) => 210 - x * 0.4 - y * 0.2,
  ]) {
    const data = shadedPupil(320, 240, [160, 120], 30, 20, background, 0)
    expect(detectSpatialPupil(cv, data, 320, 240, 0).ellipse).toBeNull()
  }
})
