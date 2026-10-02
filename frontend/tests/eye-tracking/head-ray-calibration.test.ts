import { expect, test } from "bun:test"
import {
  fitCalibration,
  mapGaze,
} from "../../apps/web/src/features/eye-tracking/calibration"
import {
  fixtureCalibrationSamples,
  fixtureEyeFeature,
  fixtureReference,
  fixtureTargets,
} from "./head-motion-fixture"
import type { HeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose.types"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

test("a static target grid cannot certify a head compensation model", () => {
  const samples = fixtureTargets.map((target) => ({
    target,
    feature: fixtureEyeFeature(target, fixtureReference),
    headPose: fixtureReference,
  }))
  expect(fitCalibration(samples)).toBeNull()
})

test("joint calibration learns mounting gain, an offset eye origin and a tilted screen", () => {
  const model = fitCalibration(fixtureCalibrationSamples())
  expect(model).not.toBeNull()
  const pose: HeadPose = {
    ...fixtureReference,
    position: [1.5, -1.5, -52],
    rotation: [0.07, -0.08, 0.06],
  }
  for (const target of [
    [0.25, 0.3],
    [0.8, 0.2],
    [0.75, 0.7],
  ] as Point[]) {
    const point = mapGaze(model!, fixtureEyeFeature(target, pose), pose)
    expect(point).not.toBeNull()
    expect(
      Math.hypot(point![0] - target[0], point![1] - target[1])
    ).toBeLessThan(0.02)
  }
})

for (const signs of [
  [-1, 1],
  [1, -1],
  [-1, -1],
]) {
  test(`input mirrors retain a fixed screen target: ${signs}`, () => {
    function mirrored(pose: HeadPose): HeadPose {
      const [x, y] = signs
      return {
        ...pose,
        position: [
          x * pose.position[0],
          y * pose.position[1],
          pose.position[2],
        ],
        rotation: [
          y * pose.rotation[0],
          x * pose.rotation[1],
          x * y * pose.rotation[2],
        ],
      }
    }
    const samples = fixtureCalibrationSamples().map((sample) => ({
      ...sample,
      headPose: mirrored(sample.headPose!),
    }))
    const model = fitCalibration(samples)
    expect(model).not.toBeNull()
    const pose = {
      ...fixtureReference,
      position: [1.5, -1.5, -52],
      rotation: [0.07, -0.08, 0.06],
    } as HeadPose
    const target: Point = [0.8, 0.2]
    const point = mapGaze(
      model!,
      fixtureEyeFeature(target, pose),
      mirrored(pose)
    )!
    expect(point).not.toBeNull()
    expect(Math.hypot(point[0] - target[0], point[1] - target[1])).toBeLessThan(
      0.02
    )
  })
}

test("small measurement noise does not destabilize held-out combined movement", () => {
  const samples = fixtureCalibrationSamples().map((sample, index) => ({
    ...sample,
    feature: [
      sample.feature[0] + 0.0003 * Math.sin(index * 7),
      sample.feature[1] + 0.0003 * Math.cos(index * 5),
    ] as Point,
  }))
  const model = fitCalibration(samples)
  expect(model).not.toBeNull()
  const pose = {
    ...fixtureReference,
    position: [-1.5, 1.5, -52],
    rotation: [-0.08, 0.07, -0.06],
  } as HeadPose
  const target: Point = [0.25, 0.7]
  const point = mapGaze(model!, fixtureEyeFeature(target, pose), pose)!
  expect(Math.hypot(point[0] - target[0], point[1] - target[1])).toBeLessThan(
    0.02
  )
})

test("hundreds of repeated exposures cannot make a static grid observable", () => {
  const samples = fixtureTargets.map((target) => ({
    target,
    feature: fixtureEyeFeature(target, fixtureReference),
    headPose: fixtureReference,
    headMeasurements: Array.from({ length: 100 }, () => ({
      feature: fixtureEyeFeature(target, fixtureReference),
      pose: fixtureReference,
    })),
  }))
  expect(fitCalibration(samples)).toBeNull()
})

test("a wrong whole fixation is rejected instead of certifying misleading compensation", () => {
  const samples = fixtureCalibrationSamples()
  samples[4].feature = fixtureEyeFeature([0.8, 0.2], fixtureReference)
  expect(fitCalibration(samples)).toBeNull()
})
