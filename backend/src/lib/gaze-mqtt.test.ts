import { describe, expect, test } from "bun:test"
import { buildZeroGyroReading } from "./gaze-mqtt"

describe("buildZeroGyroReading", () => {
  test("returns a complete zeroed reading for an unavailable gyro", () => {
    const before = Date.now()
    const reading = buildZeroGyroReading("eyetracker/device-1/gyro")

    expect(reading).toMatchObject({
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      topic: "eyetracker/device-1/gyro",
    })
    expect(reading.timestamp).toBeGreaterThanOrEqual(before)
  })
})
