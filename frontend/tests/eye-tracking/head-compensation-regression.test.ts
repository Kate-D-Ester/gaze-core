import { expect, test } from "bun:test"
import {
  fitCalibration,
  mapGaze,
} from "../../apps/web/src/features/eye-tracking/calibration"
import {
  fixtureCalibrationSamples,
  fixtureMotionPoses,
  fixtureReference,
  fixtureTargets,
} from "./head-motion-fixture"
import type { CalibrationSample } from "../../apps/web/src/features/eye-tracking/calibration.types"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type { HeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose.types"

/** Recorded-feature fixture: the webcam values have different gains and cross-axis coupling.
 * They are measurements, not an exact rigid transformation in physical space. */
function observedEye(target: Point, pose: HeadPose): Point {
  const [pitch, yaw, roll] = pose.rotation
  const horizontal = pose.position[0] / 50
  const vertical = pose.position[1] / 50
  const depth = Math.log(-pose.position[2] / 50)
  return [
    (0.5 - target[0]) / 2.5 +
      0.8 * yaw +
      0.1 * pitch +
      0.35 * horizontal +
      0.04 * vertical +
      0.02 * depth +
      0.03 * roll,
    (target[1] - 0.5) / 2 +
      0.7 * pitch +
      0.1 * yaw +
      0.4 * vertical +
      0.05 * horizontal +
      0.06 * depth +
      0.04 * roll,
  ]
}

function recordedSamples(): CalibrationSample[] {
  const samples: CalibrationSample[] = fixtureTargets.map((target) => ({
    target,
    feature: observedEye(target, fixtureReference),
    headPose: fixtureReference,
  }))
  for (const pose of fixtureMotionPoses().slice(1)) {
    samples.push({
      target: [0.5, 0.5],
      feature: observedEye([0.5, 0.5], pose),
      headPose: pose,
    })
  }
  return samples
}

test("learned compensation cancels head counter-motion when webcam pose is not a metric rigid transform", () => {
  const calibration = fitCalibration(recordedSamples())
  expect(calibration?.headCompensation).toBeDefined()
  const target: Point = [0.8, 0.2]
  for (const pose of fixtureMotionPoses()) {
    const point = mapGaze(calibration!, observedEye(target, pose), pose)
    expect(point).not.toBeNull()
    expect(point![0]).toBeCloseTo(0.8, 4)
    expect(point![1]).toBeCloseTo(0.2, 4)
  }
})

test("combined head motion preserves fixed gaze while a real gaze change still moves the dot", () => {
  const calibration = fitCalibration(recordedSamples())
  expect(calibration?.headCompensation).toBeDefined()
  const pose: HeadPose = {
    ...fixtureReference,
    position: [1.5, -1, -52],
    rotation: [0.08, -0.07, 0.04],
  }
  const fixed = mapGaze(calibration!, observedEye([0.7, 0.3], pose), pose)
  const changed = mapGaze(calibration!, observedEye([0.2, 0.8], pose), pose)
  expect(fixed![0]).toBeCloseTo(0.7, 4)
  expect(fixed![1]).toBeCloseTo(0.3, 4)
  expect(changed![0]).toBeCloseTo(0.2, 4)
  expect(changed![1]).toBeCloseTo(0.8, 4)
})

test("a single unreliable head fixation cannot be hidden by averaging opposite gaze errors", () => {
  const samples = fixtureCalibrationSamples().map((sample) => ({
    ...sample,
    feature: [sample.feature[0] * 0.25, sample.feature[1]] as Point,
  }))
  const unreliable = samples[18]
  unreliable.headMeasurements = [
    {
      feature: [unreliable.feature[0] + 0.012, unreliable.feature[1]],
      pose: unreliable.headPose!,
    },
    {
      feature: [unreliable.feature[0] - 0.012, unreliable.feature[1]],
      pose: unreliable.headPose!,
    },
  ]
  expect(fitCalibration(samples)).toBeNull()
})
