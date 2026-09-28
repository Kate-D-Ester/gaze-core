import { expect, test } from "bun:test"
import { setCanvasDimensions } from "../../apps/web/src/features/eye-tracking/canvas-sizing"

test("setting an unchanged camera preview size does not reset its backing buffer", () => {
  let width = 640,
    height = 480,
    assignments = 0
  const canvas = {
    get width() {
      return width
    },
    set width(value: number) {
      assignments++
      width = value
    },
    get height() {
      return height
    },
    set height(value: number) {
      assignments++
      height = value
    },
  }

  setCanvasDimensions(canvas, 640, 480)
  expect(assignments).toBe(0)

  setCanvasDimensions(canvas, 1280, 720)
  expect(assignments).toBe(2)
  expect([width, height]).toEqual([1280, 720])
})
