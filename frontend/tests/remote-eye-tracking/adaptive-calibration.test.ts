import { expect, test } from "bun:test"
import * as adaptiveFlow from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration"
import { fitBasePointCalibration } from "../../apps/web/src/features/remote-eye-tracking/base-point-calibration"
import {
  adaptiveCalibrationTargets,
  createAdaptiveCalibration,
  createHeadCalibration,
  finishAdaptiveCapture,
} from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration"
import {
  CALIBRATION_TARGETS,
  predictRemoteGaze,
} from "../../apps/web/src/features/remote-eye-tracking/calibration"
import type {
  CalibrationSample,
  Point,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import { isRemoteCalibration } from "../../apps/web/src/features/remote-eye-tracking/calibration-profile-adapter"
import {
  readCalibrationProfiles,
  saveCalibrationProfile,
} from "../../apps/web/src/features/tracking-calibration/calibration-profiles"
import type { CalibrationProfile } from "../../apps/web/src/features/tracking-calibration/calibration-profiles.types"

const personal: Point[] = [
  [0.5, 0.5],
  [0.04, 0.04],
  [0.5, 0.04],
  [0.96, 0.04],
  [0.96, 0.5],
  [0.96, 0.96],
  [0.5, 0.96],
  [0.04, 0.96],
  [0.04, 0.5],
]
const viewport = { width: 1200, height: 800 }
function capture(targets: Point[], start = 0): CalibrationSample[] {
  return targets.flatMap((target, targetId) =>
    Array.from({ length: 18 }, (_, frame) => ({
      target,
      targetId,
      observation: {
        timestamp: start + targetId * 10000 + frame * 100,
        width: 640,
        height: 480,
        quality: 0.9,
        reason: null,
        feature: [(target[0] - 0.5) / 0.5, (target[1] - 0.5) / 0.5, 0],
        basePoint: [
          (target[0] - 0.03) / 1.1,
          (target[1] + 0.02) / 0.9,
        ] as Point,
        baseModelVersion: "blazegaze-v1",
        pose: {
          kind: "face" as const,
          yaw: 0,
          pitch: 0,
          roll: 0,
          x: 0.5,
          y: 0.5,
          scale: 0.2,
        },
        eyes: [],
        faceBox: null,
        method: "Independent affine estimator fixture",
        processingMs: 1,
      },
    }))
  )
}

test.each(["webcam", "mobile"] as const)(
  "one nine-point fit reaches preview without silently adding checks: %s",
  (mode) => {
    const state = finishAdaptiveCapture(
      createAdaptiveCalibration(mode, false),
      capture(personal),
      viewport
    )
    expect(state.phase).toBe("complete")
    expect(state.result?.model.targetCount).toBe(9)
    expect(state.result?.samples).toHaveLength(162)
    expect(state.result?.validation).toBeNull()
    expect(state.result?.accuracyVerified).toBe(false)
    expect(
      adaptiveCalibrationTargets(createAdaptiveCalibration(mode, false))
    ).toEqual(CALIBRATION_TARGETS)
    const point = predictRemoteGaze(
      state.result!.model,
      capture([[0.02, 0.98]])[0]!.observation
    )!
    expect(point[0]).toBeCloseTo(0.02, 5)
    expect(point[1]).toBeCloseTo(0.98, 5)
  }
)

test("missing setup readings retry only the incomplete location and keep eight holds", () => {
  const setup = capture(personal)
  setup.forEach((sample) => {
    if (sample.targetId === 3) sample.observation.basePoint = null
  })
  let state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    setup,
    viewport
  )
  expect(state.failure?.fitIssue).toBe("missing-readings")
  expect(adaptiveCalibrationTargets(state)).toEqual([[0.96, 0.04]])
  state = adaptiveFlow.retryAdaptiveCalibration(state)
  state = finishAdaptiveCapture(
    state,
    capture([[0.96, 0.04]], 100000),
    viewport
  )
  expect(state.phase).toBe("complete")
  expect(state.training).toHaveLength(162)
  expect(state.result?.accuracyVerified).toBe(false)
})

test("head collection is separate from the spatial fit and a failed hold preserves the fitted map", () => {
  let state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", true),
    capture(personal),
    viewport
  )
  expect(state.phase).toBe("head")
  const spatial = state.candidate
  expect(adaptiveCalibrationTargets(state)).toEqual([[0.5, 0.5]])
  state = finishAdaptiveCapture(state, capture([[0.5, 0.5]], 100000), viewport)
  expect(state.phase).toBe("complete")
  expect(state.result?.model).toBe(spatial)
  expect(state.result?.validation).toBeNull()
  expect(state.result?.accuracyVerified).toBe(false)
  expect(state.result?.headSamples).toEqual(capture([[0.5, 0.5]], 100000))
  expect(state.result?.headCorrectionUpdated).toBe(false)
})

test("a head-only retry reuses the full-screen model and preserves it when motion is missing", () => {
  const training = capture(personal)
  const model = fitBasePointCalibration("mobile", training)!
  const initial = createHeadCalibration(model, training)
  expect(initial.mode).toBe("mobile")
  expect(initial.phase).toBe("head")
  expect(adaptiveCalibrationTargets(initial)).toEqual([[0.5, 0.5]])
  const collected = capture([[0.5, 0.5]], 100000)
  const rejected = structuredClone(collected[0]!)
  rejected.observation.timestamp = 103000
  rejected.observation.reason = "face-not-found"
  rejected.observation.feature = null
  const attempts = [...collected, rejected]
  const completed = finishAdaptiveCapture(
    initial,
    collected,
    viewport,
    attempts
  )
  expect(completed.result!.model).toBe(model)
  expect(completed.result!.samples).toBe(training)
  expect(completed.result!.headSamples).toEqual(attempts)
  expect(completed.result!.headSamples).not.toBe(attempts)
  expect(completed.result!.headCorrectionUpdated).toBe(false)
  expect(completed.result!.headMovementLearned).toBe(false)
})

test("a successful head-only retry changes only motion correction; a later failed retry keeps it", () => {
  const training = capture(personal)
  const model = fitBasePointCalibration("webcam", training)!
  const neutral = capture([[0.5, 0.5]], 100000)[0]!
  const motion: CalibrationSample[] = Array.from(
    { length: 120 },
    (_, index) => {
      const sample = structuredClone(neutral)
      const yaw = 0.15 * Math.sin((index * Math.PI) / 15)
      sample.observation.timestamp += index * 50
      sample.observation.pose!.yaw = yaw
      sample.observation.basePoint![0] -= (0.25 * yaw) / 1.1
      return sample
    }
  )
  const completed = finishAdaptiveCapture(
    createHeadCalibration(model, training),
    motion,
    viewport
  )
  const learned = completed.result!.model
  expect(completed.result!.headCorrectionUpdated).toBe(true)
  expect(completed.result!.headMovementLearned).toBe(true)
  expect(learned.headCorrection).toBeDefined()
  expect(learned.coefficients).toEqual(model.coefficients)
  expect(learned.sampleCount).toBe(162)
  expect(completed.result!.samples).toBe(training)
  expect(completed.result!.accuracyVerified).toBe(false)
  const retried = finishAdaptiveCapture(
    createHeadCalibration(learned, training),
    capture([[0.5, 0.5]], 200000),
    viewport
  )
  expect(retried.result!.model).toBe(learned)
  expect(retried.result!.headMovementLearned).toBe(true)
  expect(retried.result!.headCorrectionUpdated).toBe(false)
})

test("invalid fits never become a preview or an automatic retry loop", () => {
  const setup = capture(personal)
  setup.forEach((sample) => {
    sample.observation.basePoint = [0.5, 0.5]
  })
  let state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", true),
    setup,
    viewport
  )
  expect(state.phase).toBe("failed")
  expect(state.failure?.fitIssue).toBe("insufficient-response")
  expect(state.result).toBeNull()
  expect(finishAdaptiveCapture(state, capture(personal), viewport)).toBe(state)
  state = adaptiveFlow.retryAdaptiveCalibration(state)
  state = finishAdaptiveCapture(state, capture(personal, 100000), viewport)
  expect(state.phase).toBe("head")
  expect(state.training).toHaveLength(162)
})

test("IR uses the same nine-target flow without requiring an RGB neural network output", () => {
  const setup = capture(personal)
  setup.forEach((sample) => {
    sample.observation.basePoint = null
    sample.observation.baseModelVersion = undefined
  })
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("ir", false),
    setup,
    viewport
  )
  expect(state.phase).toBe("complete")
  expect(state.result?.model.mode).toBe("ir")
  expect(state.result?.model.targetCount).toBe(9)
  expect(state.result?.accuracyVerified).toBe(false)
})

test("legacy feature estimators keep working without RGB base predictions", () => {
  const setup = capture(personal)
  setup.forEach((sample) => {
    sample.observation.basePoint = null
    sample.observation.baseModelVersion = undefined
  })
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    setup,
    viewport
  )
  expect(state.phase).toBe("complete")
  expect(state.result?.model.inputKind).toBeUndefined()
})

test("saved spatial models preserve their version and strict profile validation", () => {
  const model = fitBasePointCalibration("mobile", capture(personal))!
  expect(isRemoteCalibration(model)).toBe(true)
  expect(isRemoteCalibration({ ...model, baseModelVersion: "unknown" })).toBe(
    false
  )
  const wrongVersion = capture([[0.3, 0.7]])[0]!.observation
  wrongVersion.baseModelVersion = "unknown"
  expect(predictRemoteGaze(model, wrongVersion)).toBeNull()
  let stored: string | null = null
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value
    },
  }
  const profile: CalibrationProfile = {
    id: "trial",
    name: "Phone",
    updatedAt: "2026-10-08T00:00:00Z",
    context: {
      version: 1,
      tracker: "mobile",
      featureVersion: model.featureVersion!,
      cameraIdentity: "a".repeat(64),
      width: 640,
      height: 480,
      inputTransform: "0:false:false",
      outputSpace: "screen",
      screenAspect: 1.5,
      setupKey: "rgb",
      geometryId: null,
    },
    offset: [0, 0],
    payload: { kind: "remote", model },
  }
  saveCalibrationProfile(profile, storage)
  expect(readCalibrationProfiles(storage).profiles[0]?.payload).toEqual(
    profile.payload
  )
  const before = stored
  expect(() =>
    saveCalibrationProfile(
      {
        ...profile,
        payload: {
          kind: "remote",
          model: { ...model, baseModelVersion: "unknown" },
        },
      },
      storage
    )
  ).toThrow("invalid")
  expect(stored).toBe(before)
})
