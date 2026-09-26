import { beforeAll, expect, test } from "bun:test"
import { TrackingEngine } from "../../apps/web/src/features/eye-tracking/engine"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"
import { EyeModelEstimator } from "../../apps/web/src/features/eye-tracking/eye-model"
import type {
  Ellipse,
  FrameSettings,
  Point,
} from "../../apps/web/src/features/eye-tracking/types"
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

test("an unlocked model loses readiness when its supporting observations expire", () => {
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
  expect(estimator.getLatest()?.ready ?? false).toBe(false)
})

test("spatial association rejects one-frame jumps but reacquires sustained eye movement", () => {
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
  expect(
    engine.process(image(265, 70), 320, 240, settings, 2, 40).detection.ellipse
  ).toBeNull()
  const recovered = engine.process(image(103, 120), 320, 240, settings, 3, 80)
  expect(recovered.detection.ellipse!.center[0]).toBeCloseTo(103, 0)
  expect(
    engine.process(image(240, 150), 320, 240, settings, 4, 120).detection
      .ellipse
  ).toBeNull()
  const moved = engine.process(image(240, 150), 320, 240, settings, 5, 160)
  expect(moved.detection.ellipse!.center[0]).toBeCloseTo(240, 0)
  const blank = new Uint8ClampedArray(320 * 240 * 4).fill(185)
  const lost = engine.process(blank, 320, 240, settings, 6, 200)
  expect(lost.gaze).toBeNull()
  expect(lost.detection.ellipse).toBeNull()
})

test("a tracked, mildly occluded pupil keeps a valid gaze instead of flickering at the acquisition cutoff", () => {
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
  expect(partial.detection.ellipse!.confidence).toBeLessThan(0.85)
  expect(partial.gaze).not.toBeNull()
  expect(
    Math.hypot(
      partial.detection.ellipse!.center[0] - 160,
      partial.detection.ellipse!.center[1] - 120
    )
  ).toBeLessThan(2)
})
