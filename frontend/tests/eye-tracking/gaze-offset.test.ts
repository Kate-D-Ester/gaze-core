import { expect, test } from "bun:test"
import {
  applyGazeOffset,
  offsetFromPixels,
} from "../../apps/web/src/features/eye-tracking/gaze-offset"

test("pixel adjustments preserve image units and direction at different resolutions", () => {
  const offset = offsetFromPixels([0, 0], 0, 32, 640)
  const both = offsetFromPixels(offset, 1, -24, 480)
  expect(both).toEqual([0.05, -0.05])
  expect(applyGazeOffset([0.5, 0.5], both)).toEqual([0.55, 0.45])
  expect(both[0] * 1280).toBe(64)
  expect(offset).toEqual([0.05, 0])
})

test("an offset never invents a missing gaze or clamps an offscreen point onto the edge", () => {
  expect(applyGazeOffset(null, [0.1, 0.1])).toBeNull()
  expect(applyGazeOffset([0.95, 0.05], [0.1, -0.1])).toEqual([1.05, -0.05])
})

test("invalid input leaves the previous correction intact and large inputs are bounded", () => {
  expect(offsetFromPixels([0.1, 0], 0, NaN, 640)).toEqual([0.1, 0])
  expect(offsetFromPixels([0.1, 0], 0, 24, 0)).toEqual([0.1, 0])
  expect(offsetFromPixels([0, 0], 0, 9999, 640)).toEqual([1, 0])
  expect(offsetFromPixels([0, 0], 1, -9999, 480)).toEqual([0, -1])
})
