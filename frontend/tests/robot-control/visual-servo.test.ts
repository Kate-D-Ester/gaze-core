import { expect, test } from "bun:test"
import { VisualServo } from "../../apps/web/src/features/robot-control/visual-servo"
import type { ObjectBox } from "../../apps/web/src/features/camera-viewer/object-tracking.types"
const normal = { rotation: 0, mirrorX: false, mirrorY: false }
const settings = { desiredWidth: 0.3, speed: 25 }
const directions: [ObjectBox, string | null][] = [
  [[0.05, 0.35, 0.35, 0.65], "L"],
  [[0.65, 0.35, 0.95, 0.65], "R"],
  [[0.45, 0.35, 0.55, 0.65], "F"],
  [[0.25, 0.35, 0.75, 0.65], "B"],
  [[0.35, 0.35, 0.65, 0.65], null],
]
for (const [box, expected] of directions) {
  test(`Target box ${box} chooses ${expected ?? "stop"}`, () => {
    expect(new VisualServo(settings).decide(box, normal)?.cmd ?? null).toBe(
      expected
    )
  })
}
test("turn before approaching an off-center small object", () => {
  expect(
    new VisualServo(settings).decide([0.75, 0.4, 0.85, 0.6], normal)
  ).toEqual({ action: "car", cmd: "R", speed: 25 })
})
test("mirror correction preserves physical turn direction", () => {
  expect(
    new VisualServo(settings).decide([0.65, 0.35, 0.95, 0.65], {
      ...normal,
      mirrorX: true,
    })?.cmd
  ).toBe("L")
})
test("hysteresis keeps a turn through noise and stops inside the release band", () => {
  const servo = new VisualServo(settings)
  expect(servo.decide([0.5, 0.35, 0.8, 0.65], normal)?.cmd).toBe("R")
  expect(servo.decide([0.41, 0.35, 0.71, 0.65], normal)?.cmd).toBe("R")
  expect(servo.decide([0.38, 0.35, 0.68, 0.65], normal)).toBeNull()
  expect(servo.decide([0.41, 0.35, 0.71, 0.65], normal)).toBeNull()
})
test("a clipped centered object cannot cause a distance move", () => {
  expect(new VisualServo(settings).decide([0.3, 0, 0.7, 1], normal)).toBeNull()
})
test("invalid geometry and settings cannot request movement", () => {
  const servo = new VisualServo(settings)
  expect(servo.decide([NaN, 0.2, 0.4, 0.5], normal)).toBeNull()
  expect(() => new VisualServo({ ...settings, desiredWidth: 0 })).toThrow()
  expect(() => new VisualServo({ ...settings, speed: 101 })).toThrow()
})

test("a small overshoot across center stops rather than reversing the turn", () => {
  const servo = new VisualServo(settings)
  expect(servo.decide([0.5, 0.35, 0.8, 0.65], normal)?.cmd).toBe("R")
  expect(servo.decide([0.29, 0.35, 0.59, 0.65], normal)).toBeNull()
  expect(servo.decide([0.24, 0.35, 0.54, 0.65], normal)?.cmd).toBe("L")
})
test("a small width overshoot stops rather than reversing the approach", () => {
  const servo = new VisualServo(settings)
  expect(servo.decide([0.45, 0.35, 0.55, 0.65], normal)?.cmd).toBe("F")
  expect(servo.decide([0.34, 0.35, 0.66, 0.65], normal)).toBeNull()
  expect(servo.decide([0.3, 0.35, 0.7, 0.65], normal)?.cmd).toBe("B")
})
