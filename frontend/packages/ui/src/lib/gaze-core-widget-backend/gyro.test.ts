import { expect, test } from "bun:test"
import { buildZeroGyroSnapshot, resolveGyroZeroSnapshot } from "./gyro"

test("resolveGyroZeroSnapshot supplies zeros when gyro data is unavailable", () => {
  const snapshot = resolveGyroZeroSnapshot(null)

  expect(snapshot).toMatchObject({
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
  })
})

test("resolveGyroZeroSnapshot preserves a captured gyro snapshot", () => {
  const snapshot = buildZeroGyroSnapshot(123)
  const captured = { ...snapshot, yaw: 12 }

  expect(resolveGyroZeroSnapshot(captured)).toBe(captured)
})
