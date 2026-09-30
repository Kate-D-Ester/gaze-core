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
test("lost acquisition remains bounded to four threshold passes and one edge pass", () => {
  let contourCalls = 0,
    edgeCalls = 0
  const instrumented = new Proxy(cv, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === "findContours" || property === "Canny")
        return (...args: unknown[]) => {
          if (property === "findContours") contourCalls++
          else edgeCalls++
          return value.apply(target, args)
        }
      return typeof value === "function" ? value.bind(target) : value
    },
  })
  const result = detectSpatialPupil(
    instrumented,
    new Uint8Array(320 * 240).fill(170),
    320,
    240,
    0,
    {
      includePreviewMasks: false,
    }
  )
  expect(result.ellipse).toBeNull()
  expect(
    result.previews.filter((preview) => preview.method === "global")
  ).toHaveLength(4)
  expect(contourCalls).toBeLessThanOrEqual(5)
  expect(edgeCalls).toBeLessThanOrEqual(1)
  expect(result.previews.every((preview) => !preview.mask)).toBe(true)
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

test("a weak observed pupil remains tracked when no stronger candidate exists", () => {
  const data = shadedPupil(320, 240, [100, 120], 19, 13, () => 185, 13)
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous: {
      center: [100, 120],
      major: 19,
      minor: 13,
      angle: 0,
      confidence: 0.95,
    },
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 100, result.ellipse!.center[1] - 120)
  ).toBeLessThan(2)
})

test("fresh pupil evidence can replace a much smaller remembered shape", () => {
  const previous = {
    center: [40, 40] as Point,
    major: 6,
    minor: 4,
    angle: 0,
    confidence: 0.95,
  }
  const result = detectSpatialPupil(cv, frame(), 320, 240, 0, {
    previous,
    trackingAnchor: previous,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 158, result.ellipse!.center[1] - 117)
  ).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 36)).toBeLessThan(2)
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

test("an unconfirmed tracked iris is replaced by its darker nested pupil", () => {
  const data = shadedPupil(320, 240, [160, 120], 78, 65, () => 165, 105)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if (((x - 160) / 35) ** 2 + ((y - 120) / 29) ** 2 <= 1)
        data[y * 320 + x] = 20
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous: {
      center: [160, 120],
      major: 78,
      minor: 65,
      angle: 0,
      confidence: 0.99,
    },
    previousAgeMs: 0,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(Math.abs(result.ellipse!.major - 35)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 29)).toBeLessThan(2)
})

test("a confirmed track still checks a darker pupil inside an iris sized rim", () => {
  const data = shadedPupil(320, 240, [160, 120], 65, 50, () => 165, 75)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if (((x - 160) / 35) ** 2 + ((y - 120) / 29) ** 2 <= 1)
        data[y * 320 + x] = 20
  const previous = {
    center: [160, 120] as Point,
    major: 65,
    minor: 50,
    angle: 0,
    confidence: 0.99,
  }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    trackingAnchor: { ...previous, major: 55, minor: 44 },
    trackingAnchorConfirmed: true,
    previousAgeMs: 40,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(Math.abs(result.ellipse!.major - 35)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 29)).toBeLessThan(2)
})

test("an enlarged enclosing iris is withheld when its dark core cannot support a pupil fit", () => {
  const data = shadedPupil(320, 240, [160, 120], 65, 50, () => 165, 75)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if (((x - 160) / 25) ** 2 + ((y - 120) / 20) ** 2 <= 1)
        data[y * 320 + x] = 20
  const previous = {
    center: [160, 120] as Point,
    major: 55,
    minor: 44,
    angle: 0,
    confidence: 0.99,
  }
  expect(
    detectSpatialPupil(cv, data, 320, 240, 0, {
      previous,
      previousAgeMs: 40,
      trackingAnchor: previous,
      trackingAnchorConfirmed: true,
      includePreviewMasks: false,
    }).ellipse
  ).toBeNull()
})

test("a reflection stripe splitting the dark core preserves the whole pupil fit", () => {
  const data = frame(0)
  for (let y = 112; y <= 120; y++)
    for (let x = 120; x <= 195; x++)
      if (data[y * 320 + x] === 20) data[y * 320 + x] = 245
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 158, result.ellipse!.center[1] - 117)
  ).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 36)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 23)).toBeLessThan(2)
  expect(result.ellipse!.confidence).toBeGreaterThanOrEqual(0.82)
})

function reflectedPupil(
  reflection: (y: number) => boolean,
  background: (x: number, y: number) => number = () => 190
) {
  const data = new Uint8Array(320 * 240)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      let value = background(x, y)
      if (((x - 160) / 72) ** 2 + ((y - 120) / 58) ** 2 <= 1)
        value = 48 + ((x * 17 + y * 29) % 70)
      if (((x - 160) / 32) ** 2 + ((y - 120) / 25) ** 2 <= 1)
        value = reflection(y) ? 245 : 25
      data[y * 320 + x] = value
    }
  return data
}

test("iris texture cannot replace a larger pupil split by reflected light", () => {
  const data = reflectedPupil(
    (y) => y >= 115 && y <= 123,
    (x, y) => 155 + Math.round(x * 0.22 + y * 0.08)
  )
  const result = detectSpatialPupil(cv, data, 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 160, result.ellipse!.center[1] - 120)
  ).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.major - 32)).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.minor - 25)).toBeLessThan(3)
  expect(result.ellipse!.confidence).toBeGreaterThanOrEqual(0.82)
})

test("multiple reflection bands cannot promote the enclosing iris", () => {
  const data = reflectedPupil(
    (y) => (y >= 107 && y <= 111) || (y >= 126 && y <= 130)
  )
  const result = detectSpatialPupil(cv, data, 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 160, result.ellipse!.center[1] - 120)
  ).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.major - 32)).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.minor - 25)).toBeLessThan(3)
})

test("a stale local intensity estimate cannot hide a new reflected pupil", () => {
  const data = reflectedPupil((y) => y >= 115 && y <= 123)
  const previous = {
    center: [260, 160] as Point,
    major: 80,
    minor: 60,
    angle: 0,
    confidence: 0.95,
  }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    trackingAnchor: previous,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 160, result.ellipse!.center[1] - 120)
  ).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.major - 32)).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.minor - 25)).toBeLessThan(3)
})

test("a low contrast pupil remains distinct from its much darker enclosing iris", () => {
  const data = new Uint8Array(320 * 240).fill(165)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 80 ** 2 + (y - 120) ** 2 / 65 ** 2 <= 1)
        data[y * 320 + x] = 20
      if ((x - 160) ** 2 / 30 ** 2 + (y - 120) ** 2 / 25 ** 2 <= 1)
        data[y * 320 + x] = 8
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(Math.abs(result.ellipse!.major - 30)).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.minor - 25)).toBeLessThan(1)
})

test("a brief lost track cannot acquire a tiny iris feature as the pupil", () => {
  const previous = {
    center: [160, 120] as Point,
    major: 36,
    minor: 23,
    angle: 0.55,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if ((x - 250) ** 2 / 5 ** 2 + (y - 180) ** 2 / 4 ** 2 <= 1)
        data[y * 320 + x] = 20
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous: null,
    previousAgeMs: 900,
    trackingAnchor: previous,
  })
  expect(result.ellipse).toBeNull()
})

test("an iris sized rim at a new location cannot replace a confirmed pupil", () => {
  const previous = {
    center: [65, 70] as Point,
    major: 25,
    minor: 20,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++)
      if ((x - 210) ** 2 / 65 ** 2 + (y - 145) ** 2 / 50 ** 2 <= 1)
        data[y * 320 + x] = 20
  expect(
    detectSpatialPupil(cv, data, 320, 240, 0, {
      previous,
      previousAgeMs: 200,
      trackingAnchor: previous,
      trackingAnchorConfirmed: true,
    }).ellipse
  ).toBeNull()
})

test("loss of the local candidate reacquires the dark pupil at its new position", () => {
  const previous = {
    center: [60, 110] as Point,
    major: 25,
    minor: 20,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 240) ** 2 / 60 ** 2 + (y - 130) ** 2 / 50 ** 2 <= 1)
        data[y * 320 + x] = 50
      if ((x - 240) ** 2 / 25 ** 2 + (y - 130) ** 2 / 20 ** 2 <= 1)
        data[y * 320 + x] = 20
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    previousAgeMs: 40,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.ellipse!.center[0]).toBeCloseTo(240, 0)
  expect(result.ellipse!.center[1]).toBeCloseTo(130, 0)
  expect(Math.abs(result.ellipse!.major - 25)).toBeLessThan(2)
  const recovery = result.previews.find(
    (preview) => preview.label === "Reacquire"
  )
  expect(recovery?.threshold).toBe(35)
})

test("an occluded rim cannot retain an unobserved pupil shape indefinitely", () => {
  const previous = {
    center: [160, 120] as Point,
    major: 30,
    minor: 20,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 30 ** 2 + (y - 120) ** 2 / 20 ** 2 <= 1)
        data[y * 320 + x] = 20
      if (y < 121) data[y * 320 + x] = 12
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    previousAgeMs: 40,
    previousShapeAgeMs: 1000,
    trackingAnchor: previous,
  })
  expect(result.ellipse === null || result.shapeObserved !== false).toBe(true)
})

test("a confirmed pupil retains its center during sustained visible-rim occlusion", () => {
  const previous = {
    center: [160, 120] as Point,
    major: 30,
    minor: 20,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 30 ** 2 + (y - 120) ** 2 / 20 ** 2 <= 1)
        data[y * 320 + x] = 20
      if (y < 121) data[y * 320 + x] = 12
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    previousAgeMs: 40,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.shapeObserved).toBe(false)
  expect(Math.abs(result.ellipse!.center[0] - 160)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.center[1] - 120)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 30)).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.minor - 20)).toBeLessThan(1)
})

test("sustained partial tracking measures size change without fitting the eyelid", () => {
  const previous = {
    center: [160, 120] as Point,
    major: 33,
    minor: 22,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 30 ** 2 + (y - 120) ** 2 / 20 ** 2 <= 1)
        data[y * 320 + x] = 20
      if (y > 119) data[y * 320 + x] = 170
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    previousAgeMs: 40,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.shapeObserved).toBe(false)
  expect(Math.abs(result.ellipse!.center[0] - 160)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.center[1] - 120)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 30)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 20)).toBeLessThan(2)
})

test("a stronger diffuse reflection cannot hide the true rim during sustained partial tracking", () => {
  const width = 320,
    height = 240,
    previous = {
      center: [160, 120] as Point,
      major: 40,
      minor: 35,
      angle: 0,
      confidence: 0.99,
    },
    pupilCenter = [163, 118] as Point
  for (const reflected of [false, true]) {
    const data = new Uint8Array(width * height).fill(90)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const radius = Math.sqrt(
          (x - pupilCenter[0]) ** 2 / 40 ** 2 +
            (y - pupilCenter[1]) ** 2 / 35 ** 2
        )
        if (radius <= 1) {
          let value = 20
          // A soft ring reflection has a 60-level halo and peaks at 150,
          // below the glint cutoff. Its 90-level rise exceeds the real rim's 70.
          if (reflected && radius >= 0.5 && radius <= 0.85) {
            value = radius < 0.7 ? 60 : 150
            if (radius >= 0.7 && radius < 0.74)
              value = 60 + (90 * (radius - 0.7)) / 0.04
            if (radius > 0.81) value = 20 + (130 * (0.85 - radius)) / 0.04
          }
          data[y * width + x] = Math.round(value)
        }
        // The lower lid hides half of the current pupil.
        if (y >= pupilCenter[1]) data[y * width + x] = 90
      }
    const result = detectSpatialPupil(cv, data, width, height, 0, {
      previous,
      previousAgeMs: 42,
      previousShapeAgeMs: 1200,
      trackingAnchor: previous,
      trackingAnchorConfirmed: true,
      pupilIntensity: 20,
      refreshShape: false,
      includePreviewMasks: false,
    })
    expect(result.ellipse).not.toBeNull()
    expect(result.shapeObserved).toBe(false)
    expect(Math.abs(result.ellipse!.center[0] - pupilCenter[0])).toBeLessThan(1)
    expect(Math.abs(result.ellipse!.center[1] - pupilCenter[1])).toBeLessThan(1)
    expect(Math.abs(result.ellipse!.major - 40)).toBeLessThan(1)
    expect(Math.abs(result.ellipse!.minor - 35)).toBeLessThan(1)
  }
})

function pupilWithReflectedCap(reflectionMajor: number, farGlint = false) {
  const width = 320,
    height = 240,
    previous = {
      center: [160, 120] as Point,
      major: 40,
      minor: 35,
      angle: 0,
      confidence: 0.99,
    },
    data = new Uint8Array(width * height).fill(170)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const pupil = (x - 160) ** 2 / 40 ** 2 + (y - 120) ** 2 / 35 ** 2,
        reflectionRadius = Math.sqrt(
          (x - 160) ** 2 / reflectionMajor ** 2 + (y - 104) ** 2 / 20 ** 2
        )
      if (pupil <= 1) {
        data[y * width + x] = 20
        // A diffuse band isolates an upper fragment within the actual pupil.
        if (reflectionRadius > 1 && reflectionRadius < 1.25)
          data[y * width + x] = 100
        if (farGlint && reflectionRadius > 1.4 && reflectionRadius < 1.9)
          data[y * width + x] = 255
      }
      if (y >= 126) data[y * width + x] = 170
    }
  return { width, height, previous, data }
}

test("a weak sustained partial still searches for a stronger pupil before refresh is due", () => {
  for (const farGlint of [false, true]) {
    const { width, height, previous, data } = pupilWithReflectedCap(
      farGlint ? 30 : 32,
      farGlint
    )
    const result = detectSpatialPupil(cv, data, width, height, 0, {
      previous,
      previousAgeMs: 42,
      previousShapeAgeMs: 1200,
      trackingAnchor: previous,
      trackingAnchorConfirmed: true,
      pupilIntensity: 20,
      refreshShape: false,
      includePreviewMasks: false,
    })
    expect(result.ellipse).not.toBeNull()
    expect(result.shapeObserved).toBe(false)
    expect(Math.abs(result.ellipse!.center[0] - 160)).toBeLessThan(2)
    expect(Math.abs(result.ellipse!.center[1] - 120)).toBeLessThan(2)
    expect(Math.abs(result.ellipse!.major - 40)).toBeLessThan(2)
    expect(Math.abs(result.ellipse!.minor - 35)).toBeLessThan(2)
    if (farGlint) {
      expect(result.ellipse!.confidence).toBeLessThan(0.8)
      expect(result.fullShapeSearched).toBe(true)
    } else {
      expect(result.ellipse!.confidence).toBe(0.8)
      expect(result.fullShapeSearched).toBe(false)
    }
  }
})

test("a bright far reflection cannot establish persistence for an internal pupil fragment", () => {
  const { width, height, previous, data } = pupilWithReflectedCap(30, true)
  const result = detectSpatialPupil(cv, data, width, height, 0, {
    previous,
    previousAgeMs: 42,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    pupilIntensity: 20,
    refreshShape: true,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.shapeObserved).toBe(false)
  expect(Math.abs(result.ellipse!.center[0] - 160)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.center[1] - 120)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 40)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 35)).toBeLessThan(2)
})

test("a diffuse reflected cap cannot skip the darker pupil before reaching the iris", () => {
  const { width, height, previous, data } = pupilWithReflectedCap(32)
  const result = detectSpatialPupil(cv, data, width, height, 0, {
    previous,
    previousAgeMs: 42,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    pupilIntensity: 20,
    refreshShape: true,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.shapeObserved).toBe(false)
  expect(Math.abs(result.ellipse!.center[0] - 160)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.center[1] - 120)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 40)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 35)).toBeLessThan(2)
})

test("a learned darker pupil quantile identifies low-intensity returns outside a reflected cap", () => {
  const { width, height, previous, data } = pupilWithReflectedCap(32)
  const result = detectSpatialPupil(cv, data, width, height, 0, {
    previous,
    previousAgeMs: 42,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    // The learned full pupil included dark regions at 20 and brighter regions
    // at 40. A return to 20 still belongs to that pupil's intensity range.
    pupilIntensity: 40,
    pupilIntensityLow: 20,
    refreshShape: true,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.shapeObserved).toBe(false)
  expect(Math.abs(result.ellipse!.center[0] - 160)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.center[1] - 120)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.major - 40)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.minor - 35)).toBeLessThan(2)
  expect(result.pupilIntensity).toBeUndefined()
  expect(result.pupilIntensityLow).toBeUndefined()
})

test("sustained partial tracking cannot follow an iris arc around a smaller dark pupil", () => {
  const previous = {
    center: [160, 120] as Point,
    major: 30,
    minor: 20,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 30 ** 2 + (y - 120) ** 2 / 20 ** 2 <= 1)
        data[y * 320 + x] = 80
      if ((x - 160) ** 2 + (y - 114) ** 2 <= 7 ** 2) data[y * 320 + x] = 20
      if (y > 119) data[y * 320 + x] = 170
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    previousAgeMs: 40,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    includePreviewMasks: false,
  })
  expect(result.ellipse).toBeNull()
})

test("an enclosing iris cannot borrow a moderately smaller pupil's dark core", () => {
  const previous = {
    center: [160, 120] as Point,
    major: 40,
    minor: 80 / 3,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(170)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      const iris = (x - 160) ** 2 / 40 ** 2 + (y - 120) ** 2 / (80 / 3) ** 2,
        pupil = (x - 160) ** 2 / 30 ** 2 + (y - 120) ** 2 / 20 ** 2
      if (iris <= 1) data[y * 320 + x] = 80
      if (pupil <= 1) data[y * 320 + x] = 20
      if (y < 110) data[y * 320 + x] = 10
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    previousAgeMs: 42,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    pupilIntensity: 20,
    refreshShape: false,
    includePreviewMasks: false,
  })
  // Withholding an uncertain pupil is allowed; reporting the enclosing iris is not.
  if (result.ellipse) {
    expect(Math.abs(result.ellipse.center[0] - 160)).toBeLessThan(2)
    expect(Math.abs(result.ellipse.center[1] - 120)).toBeLessThan(2)
    expect(Math.abs(result.ellipse.major - 30)).toBeLessThan(3)
    expect(Math.abs(result.ellipse.minor - 20)).toBeLessThan(3)
  }
})

function pupilWithDetachedRim(pupilCenter: Point = [80, 60]) {
  const width = 160,
    height = 120,
    previous = {
      center: [80, 60] as Point,
      major: 24,
      minor: 14,
      angle: 0,
      confidence: 0.99,
    },
    data = new Uint8Array(width * height).fill(170)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const oldRim = (x - 80) ** 2 / 24 ** 2 + (y - 60) ** 2 / 14 ** 2,
        pupil =
          (x - pupilCenter[0]) ** 2 / 17 ** 2 +
          (y - pupilCenter[1]) ** 2 / 10 ** 2
      if (pupil <= 1) data[y * width + x] = 110
      // A detached dark crescent supports part of the remembered larger rim.
      else if (y > 64 && oldRim < 1 && oldRim > 0.75) data[y * width + x] = 100
      if (x >= 12 && x <= 25 && y >= 15 && y <= 50) data[y * width + x] = 20
    }
  return { width, height, previous, data }
}

test("a weak sustained partial cannot hide a strong pupil at its new position", () => {
  const { width, height, previous, data } = pupilWithDetachedRim([72, 54])
  const result = detectSpatialPupil(cv, data, width, height, 0, {
    previous,
    previousAgeMs: 42,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    pupilIntensity: 110,
    refreshShape: false,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.fullShapeSearched).toBe(true)
  expect(result.strongEvidence).toBe(true)
  expect(result.shapeObserved).not.toBe(false)
  expect(Math.abs(result.ellipse!.center[0] - 72)).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.center[1] - 54)).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.major - 17)).toBeLessThan(1)
  expect(Math.abs(result.ellipse!.minor - 10)).toBeLessThan(1)
})

test("a periodic refresh promotes a strong full pupil over a favored partial rim", () => {
  const { width, height, previous, data } = pupilWithDetachedRim()
  const options = {
    previous,
    previousAgeMs: 42,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    pupilIntensity: 110,
    includePreviewMasks: false,
  }
  const partial = detectSpatialPupil(cv, data, width, height, 0, {
    ...options,
    refreshShape: false,
  })
  expect(partial.ellipse).not.toBeNull()
  expect(partial.shapeObserved).toBe(false)

  const refreshed = detectSpatialPupil(cv, data, width, height, 0, {
    ...options,
    refreshShape: true,
  })
  expect(refreshed.ellipse).not.toBeNull()
  expect(refreshed.fullShapeSearched).toBe(true)
  expect(refreshed.strongEvidence).toBe(true)
  expect(refreshed.shapeObserved).not.toBe(false)
  expect(Math.abs(refreshed.ellipse!.center[0] - 80)).toBeLessThan(1)
  expect(Math.abs(refreshed.ellipse!.center[1] - 60)).toBeLessThan(1)
  expect(Math.abs(refreshed.ellipse!.major - 17)).toBeLessThan(1)
  expect(Math.abs(refreshed.ellipse!.minor - 10)).toBeLessThan(1)
})

test("full-frame acquisition finds a soft pupil beside black padding and lens shadow", () => {
  const width = 640,
    height = 360,
    data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = 150
      if ((x - 320) ** 2 / 22 ** 2 + (y - 220) ** 2 / 14 ** 2 <= 1) value = 126
      if (x < 180) value = 25 + Math.round(x * 0.4)
      if (x >= 534) value = 0
      data[y * width + x] = value
    }
  const source = new cv.Mat(height, width, cv.CV_8UC1),
    blurred = new cv.Mat()
  try {
    source.data.set(data)
    cv.GaussianBlur(source, blurred, new cv.Size(17, 17), 3.5)
    const result = detectSpatialPupil(cv, blurred.data, width, height, 0, {
      thresholdMode: "auto",
      includePreviewMasks: false,
    })
    expect(result.ellipse).not.toBeNull()
    expect(Math.abs(result.ellipse!.center[0] - 320)).toBeLessThan(2)
    expect(Math.abs(result.ellipse!.center[1] - 220)).toBeLessThan(2)
    expect(Math.abs(result.ellipse!.major - 22)).toBeLessThan(3)
    expect(Math.abs(result.ellipse!.minor - 14)).toBeLessThan(3)
    expect(result.ellipse!.confidence).toBeGreaterThanOrEqual(0.82)
    expect(
      result.previews.filter((preview) => preview.method === "global").length
    ).toBeLessThanOrEqual(4)
  } finally {
    blurred.delete()
    source.delete()
  }
})

test("foreground acquisition cannot accept an iris enclosing a darker pupil", () => {
  const width = 320,
    height = 240,
    data = new Uint8Array(width * height).fill(170)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x < 100) data[y * width + x] = 25 + Math.round(x * 0.8)
      if (x >= 260) data[y * width + x] = 0
      if ((x - 175) ** 2 / 42 ** 2 + (y - 120) ** 2 / 30 ** 2 <= 1)
        data[y * width + x] = 130
      if ((x - 175) ** 2 / 18 ** 2 + (y - 120) ** 2 / 13 ** 2 <= 1)
        data[y * width + x] = 110
    }
  const result = detectSpatialPupil(cv, data, width, height, 0, {
    thresholdMode: "auto",
    includePreviewMasks: false,
  })
  // A withheld fit is preferable to reporting the enclosing iris as the pupil.
  if (result.ellipse) {
    expect(
      Math.hypot(result.ellipse.center[0] - 175, result.ellipse.center[1] - 120)
    ).toBeLessThan(2)
    expect(Math.abs(result.ellipse.major - 18)).toBeLessThan(3)
    expect(Math.abs(result.ellipse.minor - 13)).toBeLessThan(3)
  }
})

test("a darker external lash cannot imitate pupil darkness through interpolation", () => {
  const width = 160,
    height = 120,
    previous = {
      center: [78, 59] as Point,
      major: 17,
      minor: 10,
      angle: 0,
      confidence: 0.99,
    }
  for (const lash of [false, true]) {
    const data = new Uint8Array(width * height).fill(170)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const pupil = (x - 80) ** 2 / 17 ** 2 + (y - 60) ** 2 / 10 ** 2,
          outerLash = (x - 80) ** 2 / 24 ** 2 + (y - 60) ** 2 / 14 ** 2
        if (pupil <= 1) data[y * width + x] = 110
        // The detached lash is darker than the learned pupil. Interpolating
        // its 100-level pixels with iris 170 must not invent pupil 110 outside.
        else if (lash && y > 64 && outerLash > 0.75 && outerLash < 1)
          data[y * width + x] = 100
      }
    const result = detectSpatialPupil(cv, data, width, height, 0, {
      previous,
      previousAgeMs: 42,
      previousShapeAgeMs: 1200,
      trackingAnchor: previous,
      trackingAnchorConfirmed: true,
      pupilIntensity: 110,
      refreshShape: true,
      includePreviewMasks: false,
    })
    expect(result.ellipse).not.toBeNull()
    expect(result.strongEvidence).toBe(true)
    expect(result.shapeObserved).not.toBe(false)
    expect(Math.abs(result.ellipse!.center[0] - 80)).toBeLessThan(1)
    expect(Math.abs(result.ellipse!.center[1] - 60)).toBeLessThan(1)
    expect(Math.abs(result.ellipse!.major - 17)).toBeLessThan(1)
    expect(Math.abs(result.ellipse!.minor - 10)).toBeLessThan(1)
  }
})

test("sustained partial tracking uses the measured pupil brightness despite a darker lash", () => {
  const previous = {
    center: [160, 120] as Point,
    major: 30,
    minor: 20,
    angle: 0,
    confidence: 0.99,
  }
  const data = new Uint8Array(320 * 240).fill(180)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 30 ** 2 + (y - 120) ** 2 / 20 ** 2 <= 1)
        data[y * 320 + x] = 126
      if (y < 121) data[y * 320 + x] = 180
      if (x >= 25 && x <= 39 && y >= 20 && y <= 80) data[y * 320 + x] = 10
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0, {
    previous,
    previousAgeMs: 40,
    previousShapeAgeMs: 1200,
    trackingAnchor: previous,
    trackingAnchorConfirmed: true,
    pupilIntensity: 126,
    includePreviewMasks: false,
  })
  expect(result.ellipse).not.toBeNull()
  expect(result.shapeObserved).toBe(false)
  expect(Math.abs(result.ellipse!.center[0] - 160)).toBeLessThan(2)
  expect(Math.abs(result.ellipse!.center[1] - 120)).toBeLessThan(2)
})

test("a broad reflection cannot turn a pupil fragment into a displaced ellipse", () => {
  const data = new Uint8Array(320 * 240).fill(165)
  for (let y = 0; y < 240; y++)
    for (let x = 0; x < 320; x++) {
      if ((x - 160) ** 2 / 78 ** 2 + (y - 120) ** 2 / 65 ** 2 <= 1)
        data[y * 320 + x] = 60
      if ((x - 160) ** 2 / 35 ** 2 + (y - 120) ** 2 / 29 ** 2 <= 1)
        data[y * 320 + x] = 20
      if (x > 150 && x < 180 && y > 104 && y < 119) data[y * 320 + x] = 230
      if (x > 173 && x < 195 && y > 114 && y < 121) data[y * 320 + x] = 230
    }
  const result = detectSpatialPupil(cv, data, 320, 240, 0)
  expect(result.ellipse).not.toBeNull()
  expect(
    Math.hypot(result.ellipse!.center[0] - 160, result.ellipse!.center[1] - 120)
  ).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.major - 35)).toBeLessThan(3)
  expect(Math.abs(result.ellipse!.minor - 29)).toBeLessThan(3)
})
