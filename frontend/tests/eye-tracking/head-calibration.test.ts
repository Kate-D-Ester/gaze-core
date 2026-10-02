import {
  fixtureCalibrationSamples,
  fixtureEyeFeature,
  fixtureMotionPoses,
} from "./head-motion-fixture"
import { describe, expect, test } from "bun:test"
import {
  readHeadPose,
  relativeHeadPose,
  synchronizedHeadPose,
} from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose"
import {
  fitCalibration,
  mapGaze,
} from "../../apps/web/src/features/eye-tracking/calibration"
import type { HeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose.types"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

const reference: HeadPose = {
  id: 1,
  timestamp: 1000,
  position: [0, 0, -50],
  rotation: [0, 0, 0],
}

describe("front camera pose", () => {
  test("preserves the source similarity matrix and scale without changing the gaze model", () => {
    const matrix = [1.2, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 1.2, 0, 2, -3, -50, 1]
    const pose = readHeadPose(matrix, 4, 1000)!
    expect(pose.measurement?.scale).toBeCloseTo(1.2)
    expect(pose.measurement?.timestamp).toBe(1000)
    expect(pose.measurement?.matrix).toEqual(matrix)
    matrix[12] = 12345
    expect(pose.measurement?.matrix[12]).toBe(2)
    expect(pose.position).toEqual([2, -3, -50])
  })
  test("reads column-major translation and rejects malformed transforms", () => {
    const pose = readHeadPose(
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -3, -50, 1],
      4,
      1000
    )
    expect(pose?.position).toEqual([2, -3, -50])
    pose?.rotation.forEach((angle) => expect(angle).toBeCloseTo(0))
    expect(readHeadPose(Array(16).fill(0), 1, 1000)).toBeNull()
    expect(readHeadPose([NaN], 1, 1000)).toBeNull()
  })
  test("tracks relative translation, depth, and wrapped rotation", () => {
    const moved: HeadPose = {
      ...reference,
      position: [5, -2.5, -55],
      rotation: [0.1, -0.2, 0.3],
    }
    const relative = relativeHeadPose(moved, reference)!
    expect(relative[0]).toBeCloseTo(0.1)
    expect(relative[1]).toBeCloseTo(-0.05)
    expect(relative[2]).toBeCloseTo(Math.log(1.1))
    expect(relative[3]).toBeCloseTo(0.1)
    expect(relative[4]).toBeCloseTo(-0.2)
    expect(relative[5]).toBeCloseTo(0.3)
  })
  test("never pairs stale or unsynchronized head and eye observations", () => {
    expect(synchronizedHeadPose(reference, 1020, 1100)).toBe(reference)
    expect(synchronizedHeadPose(reference, 1300, 1300)).toBeNull()
    expect(synchronizedHeadPose(reference, 1050, 1500)).toBeNull()
  })
})

describe("calibrated geometric head compensation", () => {
  const fit = fitCalibration(fixtureCalibrationSamples())!
  test("requires paired head measurements and restricts output to the measured movement envelope", () => {
    expect(fit).not.toBeNull()
    expect(mapGaze(fit, [0, 0])).toBeNull()
    expect(
      mapGaze(fit, [0, 0], { ...reference, position: [0, 0, 10] })
    ).toBeNull()
    expect(
      mapGaze(fit, [0, 0], { ...reference, rotation: [0, 1.5, 0] })
    ).toBeNull()
    const incomplete = fixtureCalibrationSamples()
    incomplete[2].headPose = undefined
    expect(fitCalibration(incomplete)).toBeNull()
  })
  test("a fixed target survives separate yaw, pitch, roll, translation and depth changes", () => {
    const target: Point = [0.8, 0.2]
    for (const pose of fixtureMotionPoses()) {
      const point = mapGaze(fit, fixtureEyeFeature(target, pose), pose)!
      expect(point).not.toBeNull()
      expect(
        Math.hypot(point[0] - target[0], point[1] - target[1])
      ).toBeLessThan(0.005)
    }
  })
})
