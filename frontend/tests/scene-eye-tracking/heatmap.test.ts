import { expect, test } from "bun:test"
import { buildHeatmap } from "../../apps/web/src/features/scene-eye-tracking/heatmap"
import type { GazeMeasurement } from "../../apps/web/src/features/scene-eye-tracking/scene.types"
function point(
  time: number,
  position: [number, number] | null = [0.5, 0.5],
  valid = true
): GazeMeasurement {
  return {
    timestamp: time,
    position,
    pixels: null,
    valid,
    eyeId: time,
    sceneId: time,
    eyeTimestamp: time,
    sceneTimestamp: time,
    confidence: 0.9,
    reason: "",
    extrapolated: false,
  }
}
test("heatmap weights dwell time and conserves mass rather than counting frames", () => {
  const map = buildHeatmap([point(100), point(200), point(300)], 20, 10)
  expect(map.totalDwellMs).toBe(200)
  expect(map.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(200, 3)
  expect(map.weights[5 * 20 + 10]).toBeGreaterThan(map.weights[0])
})
test("heatmap excludes invalid, outside-frame and dropout-gap intervals", () => {
  const map = buildHeatmap(
    [
      point(100),
      point(200, null, false),
      point(300, [1.1, 0.4]),
      point(1000),
      point(1600),
    ],
    20,
    10
  )
  expect(map.totalDwellMs).toBe(0)
})
