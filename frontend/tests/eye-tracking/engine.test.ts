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
