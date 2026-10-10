import { expect, test } from "bun:test"
import {
  projectNearEyeGaze,
  projectRemoteGaze,
} from "../../research/gaze-3d/browser/gaze-adapters"
import {
  createVirtualFixations,
  virtualMultiply,
  virtualRotation,
} from "./virtual-rig"
import { runVirtualGazeReport } from "./virtual-report"
import type { Vector3 } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

test("fixed center, edge and corner gaze survives combined rotation, translation and depth", () => {
  const fixations = createVirtualFixations()
  expect(fixations).toHaveLength(4800)
  for (const fixation of fixations) {
    for (const result of [
      projectRemoteGaze(fixation.camera, fixation.screen),
      projectNearEyeGaze(fixation.nearEye, fixation.rig, fixation.screen),
    ]) {
      expect(result.kind).toBe("projected")
      if (result.kind === "projected") {
        expect(result.normalized[0]).toBeCloseTo(fixation.target[0], 10)
        expect(result.normalized[1]).toBeCloseTo(fixation.target[1], 10)
        expect(result.outside).toBe(false)
      }
    }
  }
})

test("moving the entire camera/screen coordinate system preserves the hit", () => {
  const rotation = virtualRotation(0.31, -0.23, 0.42)
  const translation: Vector3 = [0.2, -0.3, 0.1]
  const fixation = createVirtualFixations()[749]
  const shiftedOrigin = virtualMultiply(
    rotation,
    fixation.camera.ray.originMetres
  ).map((value, axis) => value + translation[axis]) as Vector3
  const shiftedCenter = virtualMultiply(
    rotation,
    fixation.screen.centerMetres
  ).map((value, axis) => value + translation[axis]) as Vector3
  const result = projectRemoteGaze(
    {
      ...fixation.camera,
      ray: {
        originMetres: shiftedOrigin,
        direction: virtualMultiply(rotation, fixation.camera.ray.direction),
      },
    },
    {
      ...fixation.screen,
      centerMetres: shiftedCenter,
      right: virtualMultiply(rotation, fixation.screen.right),
      down: virtualMultiply(rotation, fixation.screen.down),
    }
  )
  expect(result.kind).toBe("projected")
  if (result.kind === "projected") {
    expect(result.normalized[0]).toBeCloseTo(fixation.target[0], 12)
    expect(result.normalized[1]).toBeCloseTo(fixation.target[1], 12)
  }
})

test("simulation exposes measurement errors instead of certifying perfect physical accuracy", () => {
  const report = runVirtualGazeReport()
  expect(report.evidence).toBe("synthetic-geometry-only")
  expect(report.accuracyMeasuredOnCamera).toBe(false)
  const ideal = report.rows.find((row) => row.name === "Ideal remote geometry")!
  const angle = report.rows.find(
    (row) => row.name === "Gaze direction error: 1 degree"
  )!
  const depth = report.rows.find((row) => row.name === "Fixed origin at 60 cm")!
  const doubled = report.rows.find(
    (row) => row.name === "Head rotation applied twice"
  )!
  expect(ideal.rmsPixels!).toBeLessThan(1e-8)
  expect(angle.meanPixels!).toBeGreaterThan(20)
  expect(depth.meanPixels!).toBeGreaterThan(40)
  expect(doubled.meanPixels!).toBeGreaterThan(100)
})
