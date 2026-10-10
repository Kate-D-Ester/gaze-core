import { expect, test } from "bun:test"
import { RemoteFixationGuide } from "../../apps/web/src/features/remote-eye-tracking/fixation-guide"
import { TargetCollector } from "../../apps/web/src/features/remote-eye-tracking/sample-collector"
import {
  createAdaptiveCalibration,
  finishAdaptiveCapture,
} from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration"
import {
  CALIBRATION_TARGETS,
  predictRemoteGaze,
} from "../../apps/web/src/features/remote-eye-tracking/calibration"
import type { EyeMovementVector } from "../../apps/web/src/features/remote-eye-tracking/tracking-vectors.types"
import type {
  RemoteObservation,
  CalibrationSample,
  Point,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

function reading(timestamp: number, point: Point, yaw = 0): RemoteObservation {
  return {
    timestamp,
    width: 640,
    height: 480,
    feature: [...point, yaw],
    basePoint: point,
    quality: 0.9,
    reason: null,
    eyes: [],
    faceBox: null,
    method: "test",
    processingMs: 1,
    pose: { kind: "face", yaw, pitch: 0, roll: 0, x: 0.5, y: 0.5, scale: 0.2 },
  }
}
function hold(target: Point, point: Point): CalibrationSample[] {
  return Array.from({ length: 18 }, (_, i) => ({
    target,
    targetId: 0,
    observation: reading(800 + i * 100, point),
  }))
}

function measuredReading(
  timestamp: number,
  target: Point,
  basePoint: Point
): RemoteObservation {
  const camera: Point = [(0.5 - target[0]) * 0.12, (target[1] - 0.5) * 0.08]
  function eye(side: EyeMovementVector["side"]): EyeMovementVector {
    return {
      side,
      source: "iris-landmarks",
      origin: [100, 100],
      center: [100 + camera[0] * 50, 100 + camera[1] * 50],
      eyeWidth: 50,
      camera: [...camera],
      local: [...camera],
    }
  }
  return {
    ...reading(timestamp, basePoint),
    baseModelVersion: "blazegaze-v1",
    vectors: {
      coordinateSpace: "camera-image-x-right-y-down-z-toward-camera",
      face: null,
      leftEye: eye("left"),
      rightEye: eye("right"),
    },
  }
}
test("stable gaze at the previous dot cannot advance the next remote target", () => {
  const guide = new RemoteFixationGuide("webcam", hold([0.5, 0.5], [0.3, 0.6]))
  const target: Point = [0.04, 0.96]
  const collector = new TargetCollector(target, 1, 3000, {
    minimumSamples: 18,
    minimumDurationMs: 600,
    resetOnInvalid: true,
    accepts: (observation, samples) =>
      guide.accepts(target, observation, samples),
  })
  for (let i = 0; i < 18; i++)
    collector.add(reading(3800 + i * 100, [0.3, 0.6]), 3800 + i * 100)
  expect(collector.progress).toBe(0)
  expect(collector.samples).toHaveLength(0)
  for (let i = 0; i < 8; i++)
    collector.add(reading(6000 + i * 100, [0.1, 0.8]), 6000 + i * 100)
  expect(collector.progress).toBeGreaterThan(0)
  collector.add(reading(6900, [0.5, 0.8]), 6900)
  expect(collector.progress).toBe(0)
  expect(collector.samples).toHaveLength(0)
})
test("eye jumps, head motion and a blink reset only the incomplete fixation", () => {
  const guide = new RemoteFixationGuide("mobile", [])
  const target: Point = [0.5, 0.5]
  const collector = new TargetCollector(target, 0, 0, {
    minimumSamples: 18,
    minimumDurationMs: 600,
    resetOnInvalid: true,
    accepts: (observation, samples) =>
      guide.accepts(target, observation, samples),
  })
  for (let i = 0; i < 8; i++)
    collector.add(reading(800 + i * 100, [0.3, 0.6]), 800 + i * 100)
  collector.add(reading(1700, [0.3, 0.6], 0.15), 1700)
  expect(collector.progress).toBe(0)
  for (let i = 0; i < 8; i++)
    collector.add(reading(1800 + i * 100, [0.3, 0.6]), 1800 + i * 100)
  collector.add(
    { ...reading(2700, [0.3, 0.6]), reason: "blink", feature: null },
    2700
  )
  expect(collector.progress).toBe(0)
  for (let i = 0; i < 8; i++)
    collector.add(reading(2800 + i * 100, [0.3, 0.6]), 2800 + i * 100)
  collector.add(reading(3700, [0.7, 0.2]), 3700)
  expect(collector.progress).toBe(0)
})
test("IR camera displacements use explicit front-camera mirroring", () => {
  const center = hold([0.5, 0.5], [0.5, 0.5]).map((sample) => ({
    ...sample,
    observation: { ...sample.observation, cameraOcularOffsets: [0, 0, 0, 0] },
  }))
  const guide = new RemoteFixationGuide("ir", center)
  const left = {
    ...reading(4000, [0.5, 0.5]),
    cameraOcularOffsets: [0.1, 0.05, 0.1, 0.05],
  }
  expect(guide.accepts([0.04, 0.96], left, [])).toBe(true)
  expect(guide.accepts([0.96, 0.96], left, [])).toBe(false)
  expect(
    guide.accepts([0.04, 0.96], { ...left, cameraOcularOffsets: undefined }, [])
  ).toBe(false)
})
test("unlabeled feature axes cannot stand in for a missing gaze signal", () => {
  const guide = new RemoteFixationGuide("webcam", [])
  expect(
    guide.accepts(
      [0.5, 0.5],
      { ...reading(1000, [0.5, 0.5]), basePoint: null },
      []
    )
  ).toBe(false)
  const ir = new RemoteFixationGuide("ir", [])
  expect(ir.accepts([0.5, 0.5], reading(1000, [0.5, 0.5]), [])).toBe(false)
})

test.each(["webcam", "mobile", "ir"] as const)(
  "%s side-dot collection tolerates moderate off-axis gaze without accepting the corner",
  (mode) => {
    function observationAt(timestamp: number, point: Point): RemoteObservation {
      const observation = reading(timestamp, point)
      if (mode === "ir") {
        observation.cameraOcularOffsets = [
          0.5 - point[0],
          point[1] - 0.5,
          0.5 - point[0],
          point[1] - 0.5,
        ]
      }
      return observation
    }
    const training = [
      ...hold([0.5, 0.5], [0.5, 0.5]),
      ...hold([0.04, 0.04], [0.2, 0.2]),
      ...hold([0.96, 0.04], [0.8, 0.2]),
    ].map((sample) => ({
      ...sample,
      observation: observationAt(
        sample.observation.timestamp,
        sample.observation.basePoint!
      ),
    }))
    const guide = new RemoteFixationGuide(mode, training)
    const target: Point = [0.04, 0.5]
    const collector = new TargetCollector(target, 7, 3000, {
      minimumSamples: 18,
      minimumDurationMs: 600,
      resetOnInvalid: true,
      accepts: (observation, samples) =>
        guide.accepts(target, observation, samples),
    })
    for (let index = 0; index < 18; index++) {
      const timestamp = 3800 + index * 100
      collector.add(observationAt(timestamp, [0.2, 0.74]), timestamp)
    }
    expect(collector.samples).toHaveLength(18)
    expect(collector.progress).toBe(1)
    expect(guide.accepts(target, observationAt(6000, [0.2, 0.8]), [])).toBe(
      false
    )
    expect(guide.accepts(target, observationAt(6100, [0.8, 0.5]), [])).toBe(
      false
    )
  }
)

test.each(["webcam", "mobile"] as const)(
  "%s capture uses measured eyes rather than resetting holds on neural estimate jitter",
  (mode) => {
    const center: Point = [0.5, 0.5]
    const target: Point = [0.04, 0.5]
    const training = hold(center, center).map((sample) => ({
      ...sample,
      observation: measuredReading(
        sample.observation.timestamp,
        center,
        center
      ),
    }))
    const guide = new RemoteFixationGuide(mode, training)
    const collector = new TargetCollector(target, 7, 3000, {
      minimumSamples: 18,
      minimumDurationMs: 600,
      resetOnInvalid: true,
      accepts: (observation, samples) =>
        guide.accepts(target, observation, samples),
    })
    for (let index = 0; index < 18; index++) {
      const timestamp = 3800 + index * 100
      const noise = index % 2 === 0 ? 0.08 : -0.08
      collector.add(
        measuredReading(timestamp, target, [0.1 + noise, 0.5 - noise]),
        timestamp
      )
    }
    expect(collector.complete).toBe(true)
    expect(collector.samples).toHaveLength(18)
    const opposite = measuredReading(6000, [0.96, 0.5], [0.1, 0.5])
    expect(guide.accepts(target, opposite, [])).toBe(false)
    const movedHead = measuredReading(6100, target, [0.1, 0.5])
    movedHead.pose!.yaw = 0.15
    expect(guide.accepts(target, movedHead, collector.samples)).toBe(false)
  }
)

test.each(["webcam", "mobile"] as const)(
  "%s measured-eye capture preserves full live range even with a compressed neural response",
  (mode) => {
    const guide = new RemoteFixationGuide(mode, [])
    const collected: CalibrationSample[] = []
    function observationAt(
      timestamp: number,
      target: Point
    ): RemoteObservation {
      return measuredReading(timestamp, target, [
        0.5 + 0.005 * (target[0] - 0.5),
        0.5 + 0.005 * (target[1] - 0.5),
      ])
    }
    for (const [targetId, target] of CALIBRATION_TARGETS.entries()) {
      const started = targetId * 4000
      const collector = new TargetCollector(target, targetId, started, {
        minimumSamples: 18,
        minimumDurationMs: 600,
        resetOnInvalid: true,
        accepts: (observation, samples) =>
          guide.accepts(target, observation, samples),
      })
      for (let index = 0; index < 18; index++) {
        const timestamp = started + 800 + index * 100
        collector.add(observationAt(timestamp, target), timestamp)
      }
      expect(collector.complete).toBe(true)
      collected.push(...collector.samples)
      guide.record(target, collector.samples)
    }
    const result = finishAdaptiveCapture(
      createAdaptiveCalibration(mode, false),
      collected,
      { width: 1200, height: 800 }
    ).result
    expect(result).not.toBeNull()
    const stored = JSON.stringify(result!.model)
    for (const target of [
      [0.01, 0.5],
      [0.99, 0.5],
      [0.5, 0.01],
      [0.5, 0.99],
    ] as Point[]) {
      // Guidance must not constrain live inference or modify a saved model.
      guide.accepts([0.5, 0.5], observationAt(40000, target), [])
      const point = predictRemoteGaze(
        result!.model,
        observationAt(40000, target)
      )!
      expect(point[0]).toBeCloseTo(target[0], 6)
      expect(point[1]).toBeCloseTo(target[1], 6)
    }
    expect(JSON.stringify(result!.model)).toBe(stored)
  }
)

test("resumed neural holds retain their baseline source when eye vectors arrive later", () => {
  const guide = new RemoteFixationGuide("webcam", hold([0.5, 0.5], [0.5, 0.5]))
  const target: Point = [0.04, 0.5]
  // The vectors deliberately disagree. Switching source would reverse the
  // meaning of the already recorded baseline during this resumed capture.
  const observation = measuredReading(4000, [0.96, 0.5], [0.2, 0.5])
  expect(guide.accepts(target, observation, [])).toBe(true)
  expect(guide.accepts([0.96, 0.5], observation, [])).toBe(false)
})

test("a measured-eye baseline cannot silently fall back when one eye is unavailable", () => {
  const center: Point = [0.5, 0.5]
  const training = hold(center, center).map((sample) => ({
    ...sample,
    observation: measuredReading(sample.observation.timestamp, center, center),
  }))
  const guide = new RemoteFixationGuide("webcam", training)
  const target: Point = [0.04, 0.5]
  const missingEye = measuredReading(4000, target, [0.2, 0.5])
  missingEye.vectors!.leftEye = null
  expect(guide.accepts(target, missingEye, [])).toBe(false)
  expect(guide.reason).toBe("Waiting for a clear eye reading")
  const invalidEye = measuredReading(4100, target, [0.2, 0.5])
  invalidEye.vectors!.leftEye!.camera[0] = NaN
  expect(guide.accepts(target, invalidEye, [])).toBe(false)
})

test("IR vector guidance requires measured pupil sources from both eyes", () => {
  const center: Point = [0.5, 0.5]
  function pupilReading(timestamp: number, target: Point): RemoteObservation {
    const observation = measuredReading(timestamp, target, center)
    observation.vectors!.leftEye!.source = "ir-pupil"
    observation.vectors!.rightEye!.source = "ir-pupil"
    return observation
  }
  const training = hold(center, center).map((sample) => ({
    ...sample,
    observation: pupilReading(sample.observation.timestamp, center),
  }))
  const guide = new RemoteFixationGuide("ir", training)
  const target: Point = [0.04, 0.5]
  expect(guide.accepts(target, pupilReading(4000, target), [])).toBe(true)
  const landmarks = pupilReading(4100, target)
  landmarks.vectors!.leftEye!.source = "iris-landmarks"
  expect(guide.accepts(target, landmarks, [])).toBe(false)
})
