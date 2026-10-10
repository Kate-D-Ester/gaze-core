import { expect, test } from "bun:test"
import {
  inspectRgbFace,
  prepareBlazeGazeGeometry,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import { reusableRgbGeometry } from "../../apps/web/src/features/remote-eye-tracking/rgb-geometry-history"
import type { RgbGeometryHistory } from "../../apps/web/src/features/remote-eye-tracking/rgb-geometry-history.types"
import { face } from "./face-fixture"

const history: RgbGeometryHistory = {
  model: { faceWidthCm: 38.4, depth: 65 },
  width: 640,
  height: 480,
  timestamp: 1000,
}

test("a brief blink cannot replace person scale with a quantized iris measurement", () => {
  const reopened = face()
  for (const index of [469, 474]) {
    reopened.faceLandmarks[0][index].x += 1 / 640
  }
  for (const index of [471, 476]) {
    reopened.faceLandmarks[0][index].x -= 1 / 640
  }
  const geometry = inspectRgbFace(reopened, 640, 480)
  if (!geometry.valid) {
    throw new Error(geometry.reason)
  }
  const retained = reusableRgbGeometry(history, {
    width: 640,
    height: 480,
    timestamp: 1120,
    reason: "blink",
  })
  const input = prepareBlazeGazeGeometry(geometry, 640, 480, retained)
  expect(input.faceWidthCm).toBeCloseTo(38.4)
  expect(input.faceOrigin.every(Number.isFinite)).toBe(true)
})

test("fresh valid frames reuse the reconstructed model without changing their timestamp", () => {
  const retained = reusableRgbGeometry(history, {
    width: 640,
    height: 480,
    timestamp: 1200,
    reason: null,
  })
  expect(retained).toEqual({ faceWidthCm: 38.4, depth: 65 })
  expect(history.timestamp).toBe(1000)
})

test("face loss, ambiguous faces and invalid geometry cannot reuse person scale", () => {
  for (const reason of [
    "face-not-found",
    "multiple-faces",
    "pose-unavailable",
  ]) {
    expect(
      reusableRgbGeometry(history, {
        width: 640,
        height: 480,
        timestamp: 1120,
        reason,
      })
    ).toBeUndefined()
  }
})

test("expired, changed-resolution and nonmonotonic contexts cannot reuse geometry", () => {
  for (const frame of [
    { width: 640, height: 480, timestamp: 2001, reason: null },
    { width: 1280, height: 960, timestamp: 1120, reason: null },
    { width: 640, height: 480, timestamp: 999, reason: null },
    { width: 640, height: 480, timestamp: NaN, reason: null },
  ]) {
    expect(reusableRgbGeometry(history, frame)).toBeUndefined()
  }
})
