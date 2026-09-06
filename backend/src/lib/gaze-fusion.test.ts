import { expect, test } from "bun:test"
import { solveGazePoint } from "./gaze-fusion"

test("solveGazePoint still returns the calibrated eye point with zero gyro data", () => {
  const point = solveGazePoint({
    calibration: {
      version: 1,
      createdAt: 1,
      screen: { width: 100, height: 100 },
      points: [{ screen: [25, 30], gaze: [0, 0, 1], sampleCount: 10 }],
    },
    gazeVector: [0, 0, 1],
    zeroSnapshot: {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      timestamp: 1,
    },
    currentGyro: {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      timestamp: 1,
    },
    previousPoint: null,
  })

  expect(point).toMatchObject({
    x: 25,
    y: 30,
    gyroDelta: { yaw: 0, pitch: 0, roll: 0 },
  })
})
