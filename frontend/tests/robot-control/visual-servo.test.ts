import { expect, test } from "bun:test"
import { VisualServo } from "../../apps/web/src/features/robot-control/visual-servo"
const normal = { rotation: 0, mirrorX: false, mirrorY: false }
const settings = { speed: 50 }

test("turn left or right and never drive forward/backward from target size", () => {
  expect(
    new VisualServo(settings).decide([0.05, 0.35, 0.35, 0.65], normal, 100)?.cmd
  ).toBe("L")
  expect(
    new VisualServo(settings).decide([0.65, 0.35, 0.95, 0.65], normal, 100)?.cmd
  ).toBe("R")
  for (const box of [
    [0.45, 0.35, 0.55, 0.65],
    [0.25, 0.35, 0.75, 0.65],
    [0.3, 0, 0.7, 1],
  ] as [number, number, number, number][])
    expect(new VisualServo(settings).decide(box, normal, 100)).toBeNull()
})
test("speed increases when the same error is reached by a faster moving target", () => {
  const slow = new VisualServo(settings),
    fast = new VisualServo(settings)
  slow.decide([0.54, 0.35, 0.84, 0.65], normal, 100)
  fast.decide([0.4, 0.35, 0.7, 0.65], normal, 100)
  const slowCommand = slow.decide([0.55, 0.35, 0.85, 0.65], normal, 200)!
  const fastCommand = fast.decide([0.55, 0.35, 0.85, 0.65], normal, 200)!
  expect(slowCommand.cmd).toBe("R")
  expect(fastCommand.cmd).toBe("R")
  expect(fastCommand.speed).toBeGreaterThan(slowCommand.speed)
  expect(fastCommand.speed).toBeLessThanOrEqual(50)
})
test("an approaching target does not get the away-motion speed boost", () => {
  const away = new VisualServo(settings),
    approaching = new VisualServo(settings)
  away.decide([0.4, 0.35, 0.7, 0.65], normal, 100)
  approaching.decide([0.69, 0.35, 0.99, 0.65], normal, 100)
  expect(
    away.decide([0.55, 0.35, 0.85, 0.65], normal, 200)!.speed
  ).toBeGreaterThan(
    approaching.decide([0.55, 0.35, 0.85, 0.65], normal, 200)!.speed
  )
})
test("duplicate observation timestamps do not distort the measured motion speed", () => {
  const servo = new VisualServo(settings)
  servo.decide([0.4, 0.35, 0.7, 0.65], normal, 100)
  const command = servo.decide([0.55, 0.35, 0.85, 0.65], normal, 200)
  expect(servo.decide([0.55, 0.35, 0.85, 0.65], normal, 200)).toEqual(command)
})
test("mirror correction preserves the physical turn direction", () => {
  expect(
    new VisualServo(settings).decide(
      [0.65, 0.35, 0.95, 0.65],
      { ...normal, mirrorX: true },
      100
    )?.cmd
  ).toBe("L")
})
test("approximate centering holds through jitter rather than chasing the exact middle", () => {
  const servo = new VisualServo(settings)
  expect(servo.decide([0.55, 0.35, 0.85, 0.65], normal, 100)?.cmd).toBe("R")
  expect(servo.decide([0.45, 0.35, 0.75, 0.65], normal, 200)?.cmd).toBe("R")
  let timestamp = 300
  for (const x of [0.42, 0.43, 0.4, 0.41, 0.35, 0.29, 0.25])
    expect(
      servo.decide([x, 0.35, x + 0.3, 0.65], normal, (timestamp += 100))
    ).toBeNull()
})
test("invalid geometry, speed and old motion samples cannot request unsafe speed", () => {
  const servo = new VisualServo(settings)
  expect(servo.decide([NaN, 0.2, 0.4, 0.5], normal, 100)).toBeNull()
  expect(() => new VisualServo({ speed: 0 })).toThrow()
  expect(() => new VisualServo({ speed: 101 })).toThrow()
  servo.decide([0.4, 0.35, 0.7, 0.65], normal, 100)
  expect(servo.decide([0.55, 0.35, 0.85, 0.65], normal, 1000)).toEqual(
    new VisualServo(settings).decide([0.55, 0.35, 0.85, 0.65], normal, 1000)
  )
})
