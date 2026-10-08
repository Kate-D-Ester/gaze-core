import { beforeAll, expect, test } from "bun:test"
import { TrackingEngine } from "../../apps/web/src/features/eye-tracking/engine"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"
import { EyeModelEstimator } from "../../apps/web/src/features/eye-tracking/eye-model"
import type {
  Ellipse,
  FrameSettings,
  Point,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
let engine: TrackingEngine
beforeAll(async () => {
  engine = new TrackingEngine((await loadOpenCv()).cv)
})
const observations = () =>
  Array.from({ length: 45 }, (_, i): Ellipse => {
    const a = (i * 2 * Math.PI) / 45
    return {
      center: [160 + 55 * Math.cos(a), 120 + 40 * Math.sin(a)],
      major: 25,
      minor: 15,
      angle: Math.atan2(40 * Math.sin(a), 55 * Math.cos(a)) + Math.PI / 2,
      confidence: 0.99,
    }
  })
test("model requires diverse observations and freezes only a ready fit", () => {
  const estimator = new EyeModelEstimator()
  for (let i = 0; i < 100; i++) estimator.observe(observations()[0], 320, 240)
  expect(estimator.getLatest()?.ready ?? false).toBe(false)
  for (const e of observations()) estimator.observe(e, 320, 240)
  expect(estimator.getLatest()?.ready).toBe(true)
  expect(estimator.getLatest()!.center[0]).toBeCloseTo(160, 6)
  estimator.reset()
  expect(estimator.getLatest()).toBeNull()
})
test("classic engine returns no stale gaze after pupil loss and local/global coordinates agree", () => {
  const width = 320,
    height = 240,
    roi = { x: 60, y: 40, width: 200, height: 160 }
  const settings: FrameSettings = {
    format: "classic",
    roi,
    threshold: 50,
    fov: 45,
    radiusMm: 12,
    corners: [
      [100, 120],
      [220, 120],
    ],
    locked: true,
  }
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = (x - 165) ** 2 + (y - 122) ** 2 < 10 ** 2 ? 10 : 180
      const i = (y * width + x) * 4
      rgba[i] = rgba[i + 1] = rgba[i + 2] = value
    }
  const found = engine.process(rgba, width, height, settings, 1, 100)
  expect(found.gaze).not.toBeNull()
  const p = found.detection.ellipse!.center
  expect(p[0] + roi.x).toBeCloseTo(165, 0)
  rgba.fill(255)
  expect(engine.process(rgba, width, height, settings, 2, 200).gaze).toBeNull()
  engine.reset()
  expect(
    engine.process(
      rgba,
      width,
      height,
      { ...settings, format: "spatial" },
      3,
      300
    ).model
  ).toBeNull()
})

test("manual tracker fits an oblong pupil with the shared ellipse detector", () => {
  engine.reset()
  const width = 320
  const height = 240
  const angle = 0.4
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - 160
      const dy = y - 120
      const majorAxis = dx * cosine + dy * sine
      const minorAxis = -dx * sine + dy * cosine
      const isInsidePupil =
        majorAxis ** 2 / 40 ** 2 + minorAxis ** 2 / 22 ** 2 <= 1
      const value = isInsidePupil ? 20 : 180
      const pixel = (y * width + x) * 4
      rgba[pixel] = value
      rgba[pixel + 1] = value
      rgba[pixel + 2] = value
      rgba[pixel + 3] = 255
    }
  }

  const settings: FrameSettings = {
    format: "classic",
    roi: { x: 0, y: 0, width, height },
    threshold: 70,
    thresholdMode: "manual",
    fov: 45,
    radiusMm: 12,
    corners: [
      [100, 120],
      [220, 120],
    ],
    locked: false,
  }
  const result = engine.process(rgba, width, height, settings, 1, 100)
  const ellipse = result.detection.ellipse

  expect(ellipse).not.toBeNull()
  expect(ellipse!.major).toBeGreaterThan(ellipse!.minor * 1.3)
  expect(ellipse!.major).toBeCloseTo(40, 0)
  expect(ellipse!.minor).toBeCloseTo(22, 0)
})

test("a ready eye model stays available through transient fit failures", () => {
  const estimator = new EyeModelEstimator()
  for (const e of observations()) estimator.observe(e, 320, 240)
  expect(estimator.getLatest()?.ready).toBe(true)
  for (let i = 0; i < 120; i++)
    estimator.observe(
      {
        center: [80 + i, 100],
        major: 25,
        minor: 15,
        angle: 0,
        confidence: 0.99,
      },
      320,
      240
    )
  expect(estimator.getLatest()?.ready).toBe(true)
})

test("spatial association confirms initial jumps and immediately follows established pupil movement", () => {
  engine.reset()
  const settings: FrameSettings = {
    format: "spatial",
    roi: { x: 0, y: 0, width: 320, height: 240 },
    threshold: 0,
    fov: 45,
    radiusMm: 12,
    corners: null,
    locked: false,
  }
  const image = (cx: number, cy: number) => {
    const out = new Uint8ClampedArray(320 * 240 * 4).fill(255)
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 320; x++) {
        const i = (y * 320 + x) * 4,
          value =
            (x - cx) ** 2 / 19 ** 2 + (y - cy) ** 2 / 13 ** 2 <= 1 ? 30 : 185
        out[i] = out[i + 1] = out[i + 2] = value
      }
    return out
  }
  expect(
    engine.process(image(100, 120), 320, 240, settings, 1, 0).detection.ellipse
  ).not.toBeNull()
  const jump = engine.process(image(265, 70), 320, 240, settings, 2, 40)
  expect(jump.detection.ellipse).toBeNull()
  expect(jump.detection.candidate).toBeDefined()
  expect(jump.gaze).toBeNull()
  const recovered = engine.process(image(103, 120), 320, 240, settings, 3, 80)
  expect(recovered.detection.ellipse!.center[0]).toBeCloseTo(103, 0)
  expect(
    engine.process(image(240, 150), 320, 240, settings, 4, 120).detection
      .ellipse!.center[0]
  ).toBeCloseTo(240, 0)
  const moved = engine.process(image(240, 150), 320, 240, settings, 5, 160)
  expect(moved.detection.ellipse!.center[0]).toBeCloseTo(240, 0)
  const blank = new Uint8ClampedArray(320 * 240 * 4).fill(185)
  const lost = engine.process(blank, 320, 240, settings, 6, 200)
  expect(lost.gaze).toBeNull()
  expect(lost.detection.ellipse).toBeNull()
})

test("a tracked, mildly occluded pupil keeps valid gaze and a stable center", () => {
  engine.reset()
  const settings: FrameSettings = {
    format: "spatial",
    roi: { x: 0, y: 0, width: 320, height: 240 },
    threshold: 0,
    fov: 45,
    radiusMm: 12,
    corners: null,
    locked: false,
  }
  const image = (
    cx: number,
    cy: number,
    major: number,
    minor: number,
    angle: number,
    cut = 0
  ) => {
    const out = new Uint8ClampedArray(320 * 240 * 4).fill(255),
      c = Math.cos(angle),
      s = Math.sin(angle)
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 320; x++) {
        const dx = x - cx,
          dy = y - cy,
          i = (y * 320 + x) * 4
        const inside =
          ((dx * c + dy * s) / major) ** 2 +
            ((-dx * s + dy * c) / minor) ** 2 <=
          1
        const v = inside && y >= cut ? 30 : 180
        out[i] = out[i + 1] = out[i + 2] = v
      }
    return out
  }
  let id = 0,
    fitted
  for (const e of observations())
    fitted = engine.process(
      image(...e.center, e.major, e.minor, e.angle),
      320,
      240,
      settings,
      ++id,
      id * 40
    )
  expect(fitted!.model?.ready).toBe(true)
  settings.locked = true
  for (let i = 0; i < 2; i++)
    engine.process(
      image(160, 120, 28, 22, 0),
      320,
      240,
      settings,
      ++id,
      id * 40
    )
  const partial = engine.process(
    image(160, 120, 28, 22, 0, 106),
    320,
    240,
    settings,
    ++id,
    id * 40
  )
  expect(partial.detection.tracking).toBe("tracking")
  expect(partial.gaze).not.toBeNull()
  expect(
    Math.hypot(
      partial.detection.ellipse!.center[0] - 160,
      partial.detection.ellipse!.center[1] - 120
    )
  ).toBeLessThan(2)
})

test("strong pupil evidence follows a same scale saccade without a confirmation gap", () => {
  engine.reset()
  const width = 320,
    height = 240,
    settings: FrameSettings = {
      format: "spatial",
      roi: { x: 0, y: 0, width, height },
      thresholdMode: "auto",
      threshold: 0,
      fov: 45,
      radiusMm: 12,
      corners: null,
      locked: false,
    }
  const image = (cx: number, cy: number) => {
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const value =
          (x - cx) ** 2 / 25 ** 2 + (y - cy) ** 2 / 18 ** 2 <= 1 ? 25 : 170
        const offset = (y * width + x) * 4
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value
      }
    return pixels
  }
  for (let frame = 0; frame < 3; frame++)
    engine.process(
      image(70, 145),
      width,
      height,
      settings,
      frame,
      frame * 40,
      false
    )
  const moved = engine.process(
    image(255, 65),
    width,
    height,
    settings,
    3,
    120,
    false
  )
  expect(moved.detection.ellipse).not.toBeNull()
  expect(moved.detection.ellipse!.center[0]).toBeCloseTo(255, 0)
  expect(moved.detection.ellipse!.center[1]).toBeCloseTo(65, 0)
})

test("gradual pupil constriction and dilation retain a continuously measured track", () => {
  const width = 320,
    height = 240,
    settings: FrameSettings = {
      format: "spatial",
      roi: { x: 0, y: 0, width, height },
      thresholdMode: "auto",
      threshold: 0,
      fov: 45,
      radiusMm: 12,
      corners: null,
      locked: false,
    },
    pixels = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const direction of [-1, 1]) {
    engine.reset()
    for (let frame = 0; frame <= 96; frame++) {
      const major = direction < 0 ? 40 - frame * 0.25 : 16 + frame * 0.25,
        minor = major * 0.75
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const value =
              ((x - 160) / major) ** 2 + ((y - 120) / minor) ** 2 <= 1
                ? 25
                : 170,
            offset = (y * width + x) * 4
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value
        }
      const result = engine.process(
        pixels,
        width,
        height,
        settings,
        frame,
        frame * (1000 / 24),
        false
      )
      expect(result.detection.ellipse).not.toBeNull()
      expect(Math.abs(result.detection.ellipse!.major - major)).toBeLessThan(2)
    }
  }
})

test("fresh pupil arcs sustain measured position through long occlusion and stop on closure", () => {
  engine.reset()
  const width = 320,
    height = 240,
    settings: FrameSettings = {
      format: "spatial",
      roi: { x: 0, y: 0, width, height },
      thresholdMode: "auto",
      threshold: 0,
      fov: 45,
      radiusMm: 12,
      corners: null,
      locked: false,
    }
  const image = (cx: number, cy: number, occluded: boolean) => {
    const out = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        let value =
          (x - cx) ** 2 / 30 ** 2 + (y - cy) ** 2 / 20 ** 2 <= 1 ? 126 : 170
        if (occluded && y < cy + 1) value = 12
        out[i] = out[i + 1] = out[i + 2] = value
        out[i + 3] = 255
      }
    return out
  }
  let id = 0
  for (; id < 4; id++)
    engine.process(
      image(160, 120, false),
      width,
      height,
      settings,
      id,
      id * 40,
      false
    )
  for (; id < 54; id++) {
    const cx = 160 + Math.round(8 * Math.sin(id / 8)),
      cy = 120 + Math.round(4 * Math.cos(id / 8)),
      frame = engine.process(
        image(cx, cy, true),
        width,
        height,
        settings,
        id,
        id * 40,
        false
      )
    expect(frame.detection.ellipse).not.toBeNull()
    expect(frame.detection.shapeObserved).toBe(false)
    expect(Math.abs(frame.detection.ellipse!.center[0] - cx)).toBeLessThan(2)
    expect(Math.abs(frame.detection.ellipse!.center[1] - cy)).toBeLessThan(2)
  }
  const closed = new Uint8ClampedArray(width * height * 4).fill(170)
  const frame = engine.process(
    closed,
    width,
    height,
    settings,
    id,
    id * 40,
    false
  )
  expect(frame.detection.ellipse).toBeNull()
  expect(frame.gaze).toBeNull()
})

test("full raster pupil evidence supports bounded translation correction before gaze mapping", () => {
  engine.reset()
  const settings: FrameSettings = {
    format: "spatial",
    roi: { x: 0, y: 0, width: 320, height: 240 },
    thresholdMode: "auto",
    threshold: 0,
    fov: 45,
    radiusMm: 12,
    corners: null,
    locked: false,
  }
  let id = 0
  const process = (index: number, offset: Point = [0, 0]) => {
    const angle = (index * 2 * Math.PI) / 48
    const nx = 0.55 * Math.cos(angle)
    const ny = 0.45 * Math.sin(angle)
    const ellipse = {
      center: [160 + 60 * nx + offset[0], 120 + 60 * ny + offset[1]],
      major: 18,
      minor: 18 * Math.sqrt(1 - nx * nx - ny * ny),
      angle: Math.atan2(ny, nx) + Math.PI / 2,
    }
    const pixels = new Uint8ClampedArray(320 * 240 * 4).fill(180)
    const cosine = Math.cos(ellipse.angle)
    const sine = Math.sin(ellipse.angle)
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 320; x++) {
        const dx = x - ellipse.center[0]
        const dy = y - ellipse.center[1]
        const inside =
          ((dx * cosine + dy * sine) / ellipse.major) ** 2 +
            ((-dx * sine + dy * cosine) / ellipse.minor) ** 2 <=
          1
        const value = inside ? 25 : 180
        const pixel = (y * 320 + x) * 4
        pixels[pixel] = pixels[pixel + 1] = pixels[pixel + 2] = value
      }
    }
    id++
    return engine.process(pixels, 320, 240, settings, id, id * 40, false)
  }
  for (let index = 0; index < 96; index++) {
    process(index)
  }
  settings.locked = true
  const baseline = process(0)
  expect(baseline.model?.ready).toBe(true)
  const shifted = process(0, [8, -6])
  for (let index = 1; index < 192; index++) {
    process(index, [8, -6])
  }
  const corrected = process(0, [8, -6])
  // Rasterization and fitted axis orientation introduce subpixel center error.
  expect(Math.abs(corrected.slippage!.offset[0] - 8)).toBeLessThan(0.5)
  expect(Math.abs(corrected.slippage!.offset[1] + 6)).toBeLessThan(0.5)
  expect(
    Math.abs(shifted.gaze!.direction[0] - baseline.gaze!.direction[0])
  ).toBeGreaterThan(0.1)
  expect(
    Math.abs(corrected.gaze!.direction[0] - baseline.gaze!.direction[0])
  ).toBeLessThan(0.01)
  expect(corrected.model).toEqual(baseline.model)
})
