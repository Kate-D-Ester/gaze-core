import { expect, test } from "bun:test"
import {
  createAdaptiveCalibration,
  finishAdaptiveCapture,
  PERSONAL_TARGETS,
} from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration"
import { predictRemoteGaze } from "../../apps/web/src/features/remote-eye-tracking/calibration"
import { fitJointRemoteMotion } from "../../apps/web/src/features/remote-eye-tracking/joint-motion-calibration"
import { isRemoteCalibration } from "../../apps/web/src/features/remote-eye-tracking/calibration-profile-adapter"
import {
  RGB_BASE_MODEL_VERSION,
  RGB_EMBEDDING_VERSION,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-model-version"
import type {
  CalibrationSample,
  Point,
  RemoteMode,
  RemoteObservation,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

// A known linear eye/head relation. The gaze grid has small incidental head
// movements correlated with its targets; the separate hold breaks that confound.
function reading(
  target: Point,
  motion: number[],
  timestamp: number,
  mode: RemoteMode
): RemoteObservation {
  const [yaw, pitch, roll, x, y, distance] = motion as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const ocularX = (target[0] - 0.5) / 8 - yaw * 0.8 - x * 0.3
  const ocularY = (target[1] - 0.5) / 8 + pitch * 0.9 - y * 0.2
  const ocular = [ocularX, ocularY, ocularX, ocularY]
  let feature = [
    ...ocular,
    yaw,
    pitch,
    roll,
    x,
    y,
    distance,
    ...Array(4).fill(0),
  ]
  if (mode !== "ir") {
    feature = [
      ocularX,
      ocularY,
      ...ocular,
      yaw,
      pitch,
      roll,
      x,
      y,
      distance,
      ...Array(17).fill(0),
    ]
  }
  return {
    timestamp,
    width: 1280,
    height: 720,
    feature,
    featureVersion: "synthetic-motion-v1",
    basePoint: mode === "ir" ? null : [0.5 + ocularX, 0.5 + ocularY],
    baseModelVersion: mode === "ir" ? undefined : RGB_BASE_MODEL_VERSION,
    appearanceEmbedding:
      mode === "ir"
        ? undefined
        : Array.from({ length: 16 }, (_, index) =>
            index % 2 === 0 ? ocularX : ocularY
          ),
    appearanceVersion: mode === "ir" ? undefined : RGB_EMBEDDING_VERSION,
    quality: 0.9,
    reason: null,
    eyes: [],
    faceBox: null,
    method: "synthetic",
    processingMs: 1,
    pose: {
      kind: "face",
      yaw,
      pitch,
      roll,
      x: 0.5 + x,
      y: 0.5 + y,
      scale: 0.2 * Math.exp(distance),
    },
  }
}
function motionAt(index: number): number[] {
  const phase = (index * Math.PI) / 15
  return [
    0.2 * Math.sin(phase),
    0.16 * Math.cos(phase),
    0.12 * Math.sin(phase * 2),
    0.06 * Math.cos(phase * 2),
    0.05 * Math.sin(phase * 3),
    0.12 * Math.cos(phase * 3),
  ]
}
function grid(mode: RemoteMode): CalibrationSample[] {
  return PERSONAL_TARGETS.flatMap((target, targetId) =>
    Array.from({ length: 18 }, (_, index) => ({
      target,
      targetId,
      observation: reading(
        target,
        [0.005 * (target[0] - 0.5), 0.005 * (target[1] - 0.5), 0, 0, 0, 0],
        (targetId * 18 + index) * 50,
        mode
      ),
    }))
  )
}
function head(mode: RemoteMode): CalibrationSample[] {
  return Array.from({ length: 120 }, (_, index) => ({
    target: [0.5, 0.5],
    targetId: 0,
    observation: reading([0.5, 0.5], motionAt(index), 10000 + index * 50, mode),
  }))
}
const viewport = { width: 1280, height: 720 }

test.each(["webcam", "mobile", "ir"] as RemoteMode[])(
  "%s jointly learns head motion without excessive gain or losing perimeter gaze",
  (mode) => {
    const spatial = finishAdaptiveCapture(
      createAdaptiveCalibration(mode, true),
      grid(mode),
      viewport
    )
    expect(spatial.phase).toBe("head")
    const unchanged = JSON.stringify(spatial)
    const completed = finishAdaptiveCapture(spatial, head(mode), viewport)
    const fitted = completed.result!.model
    expect(completed.result!.headMovementLearned).toBe(true)
    expect(fitted.motionFit).toBeDefined()
    expect(JSON.stringify(spatial)).toBe(unchanged)
    expect(isRemoteCalibration(JSON.parse(JSON.stringify(fitted)))).toBe(true)
    for (const target of [
      [0.04, 0.04],
      [0.96, 0.04],
      [0.96, 0.96],
      [0.04, 0.96],
      [0.5, 0.5],
    ] as Point[]) {
      for (const index of [0.7, 10.3, 22.1, 43.4]) {
        const predicted = predictRemoteGaze(
          fitted,
          reading(target, motionAt(index), 20000, mode)
        )!
        expect(predicted).not.toBeNull()
        expect(
          Math.hypot(predicted[0] - target[0], predicted[1] - target[1])
        ).toBeLessThan(0.04)
      }
    }
    expect(fitted.motionFit!.motionRms).toBeLessThan(
      fitted.motionFit!.baselineMotionRms * 0.75
    )
  }
)

test("an unusable head hold keeps the gaze calibration and does not claim motion compensation", () => {
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", true),
    grid("webcam"),
    viewport
  )
  const stationary = head("webcam").map((sample) => ({
    ...sample,
    observation: reading(
      [0.5, 0.5],
      [0, 0, 0, 0, 0, 0],
      sample.observation.timestamp,
      "webcam"
    ),
  }))
  const completed = finishAdaptiveCapture(state, stationary, viewport)
  expect(completed.result!.model).toBe(state.candidate!)
  expect(completed.result!.headMovementLearned).toBe(false)
})

test("uncorrelated ocular noise in the head hold cannot buy motion accuracy by shrinking the gaze grid", () => {
  const spatial = finishAdaptiveCapture(
    createAdaptiveCalibration("ir", true),
    grid("ir"),
    viewport
  )
  const noisy = head("ir").map((sample, index) => ({
    ...sample,
    observation: reading(
      [
        0.5 + 0.45 * Math.sin(index * 1.92),
        0.5 + 0.45 * Math.cos(index * 2.37),
      ],
      motionAt(index),
      sample.observation.timestamp,
      "ir"
    ),
  }))
  const completed = finishAdaptiveCapture(spatial, noisy, viewport)
  expect(completed.result!.model).toBe(spatial.candidate!)
  expect(completed.result!.headMovementLearned).toBe(false)
})

test("horizontal appearance noise cannot qualify by contracting one screen axis", () => {
  const appearanceReading = (
    target: Point,
    motion: number[],
    timestamp: number
  ): RemoteObservation => ({
    ...reading(target, motion, timestamp, "webcam"),
    feature: reading(target, motion, timestamp, "webcam").feature!.map(
      (value, index) => (index < 6 ? 0 : value)
    ),
    basePoint: [0.5, 0.5],
    appearanceEmbedding: [
      target[0] - 0.5,
      target[0] - 0.5,
      ...Array(14).fill(target[1] - 0.5),
    ],
  })
  const input = grid("webcam").map((sample) => ({
    ...sample,
    observation: appearanceReading(
      sample.target,
      [0, 0, 0, 0, 0, 0],
      sample.observation.timestamp
    ),
  }))
  const spatial = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", true),
    input,
    viewport
  )
  expect(spatial.candidate).not.toBeNull()
  const noisy = head("webcam").map((sample, index) => ({
    ...sample,
    observation: appearanceReading(
      [0.5 + 0.2 * Math.sin(index * 1.92), 0.5],
      motionAt(index),
      sample.observation.timestamp
    ),
  }))
  expect(fitJointRemoteMotion(spatial.candidate!, input, noisy)).toBeNull()
})

test("a joint retry cannot improve yaw by forgetting the other learned motion axes", () => {
  const input = grid("ir")
  const spatial = finishAdaptiveCapture(
    createAdaptiveCalibration("ir", true),
    input,
    viewport
  )
  const first = finishAdaptiveCapture(spatial, head("ir"), viewport).result!
    .model
  const previous = structuredClone(first)
  // Simulate drift of the yaw coefficient; the other five axes remain useful.
  previous.coefficients[0][5]! += 0.2
  const yawOnly = head("ir").map((sample, index) => ({
    ...sample,
    observation: reading(
      [0.5, 0.5],
      [0.2 * Math.sin((index * Math.PI) / 15), 0, 0, 0, 0, 0],
      sample.observation.timestamp,
      "ir"
    ),
  }))
  expect(fitJointRemoteMotion(previous, input, yawOnly)).toBeNull()
})

test("personalized motion fitting keeps the source version for unversioned legacy readings", () => {
  const unversioned = (samples: CalibrationSample[]) =>
    samples.map((sample) => ({
      ...sample,
      // An appearance signal can remain useful when measured iris offsets are
      // flat. This forces the personalized representation instead of raw 29D.
      observation: {
        ...sample.observation,
        featureVersion: undefined,
        feature: sample.observation.feature!.map((value, index) =>
          index < 6 ? 0 : value
        ),
        basePoint: [0.5, 0.5] as Point,
      },
    }))
  const spatial = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", true),
    unversioned(grid("webcam")),
    viewport
  )
  const completed = finishAdaptiveCapture(
    spatial,
    unversioned(head("webcam")),
    viewport
  )
  expect(completed.result!.model.inputKind).toBe("appearance")
  const observation = unversioned([
    {
      target: [0.5, 0.5],
      targetId: 0,
      observation: reading([0.5, 0.5], motionAt(3.2), 20000, "webcam"),
    },
  ])[0]!.observation
  expect(predictRemoteGaze(completed.result!.model, observation)).not.toBeNull()
})

/** Independent camera-plane fixture: head turn changes the projected face axis,
 * and canthus-local coordinates rotate with roll. This tests a measured feature
 * representation, not physical angular accuracy on a consumer camera. */
function cameraPlaneReading(
  target: Point,
  motion: number[],
  timestamp: number
): RemoteObservation {
  const [yaw, pitch, roll, x, y, depth] = motion
  const forwardX =
    Math.cos(roll!) * Math.sin(yaw!) * Math.cos(pitch!) +
    Math.sin(roll!) * Math.sin(pitch!)
  const forwardY =
    Math.sin(roll!) * Math.sin(yaw!) * Math.cos(pitch!) -
    Math.cos(roll!) * Math.sin(pitch!)
  const forwardZ = Math.cos(yaw!) * Math.cos(pitch!)
  const cx = (target[0] - 0.5) / 5 - (0.8 * forwardX) / forwardZ - 0.2 * x!
  const cy =
    (target[1] - 0.5) / 6 +
    (0.7 * forwardY) / forwardZ -
    0.3 * y! -
    0.04 * depth!
  const lx = Math.cos(roll!) * cx - Math.sin(roll!) * cy
  const ly = Math.sin(roll!) * cx + Math.cos(roll!) * cy
  return {
    ...reading(target, motion, timestamp, "ir"),
    feature: [lx, ly, lx, ly, yaw!, pitch!, roll!, x!, y!, depth!, 0, 0, 0, 0],
    ...{ cameraOcularOffsets: [cx, cy, cx, cy] },
  }
}

test("IR camera-plane compensation preserves perimeter gaze through combined yaw, pitch and roll", () => {
  const spatialSamples = PERSONAL_TARGETS.flatMap((target, targetId) =>
    Array.from({ length: 18 }, (_, index) => ({
      target,
      targetId,
      observation: cameraPlaneReading(
        target,
        [0, 0, 0, 0, 0, 0],
        targetId * 1000 + index * 50
      ),
    }))
  )
  const spatial = finishAdaptiveCapture(
    createAdaptiveCalibration("ir", true),
    spatialSamples,
    viewport
  )
  expect(spatial.phase).toBe("head")
  const motionSamples: CalibrationSample[] = Array.from(
    { length: 120 },
    (_, index) => ({
      target: [0.5, 0.5],
      targetId: 0,
      observation: cameraPlaneReading(
        [0.5, 0.5],
        motionAt(index).map((v) => v * 1.5),
        10000 + index * 50
      ),
    })
  )
  const result = finishAdaptiveCapture(spatial, motionSamples, viewport).result!
  expect(result.model.inputKind).toBe("binocular-camera")
  expect(result.model.motionFit).toBeDefined()
  expect(isRemoteCalibration(JSON.parse(JSON.stringify(result.model)))).toBe(
    true
  )
  const missing = cameraPlaneReading([0.5, 0.5], [0, 0, 0, 0, 0, 0], 20000)
  missing.cameraOcularOffsets = undefined
  expect(predictRemoteGaze(result.model, missing)).toBeNull()
  missing.cameraOcularOffsets = [NaN, 0, 0, 0]
  expect(predictRemoteGaze(result.model, missing)).toBeNull()
  missing.cameraOcularOffsets = [0, 0]
  expect(predictRemoteGaze(result.model, missing)).toBeNull()
  for (const target of [
    [0.02, 0.02],
    [0.98, 0.02],
    [0.98, 0.98],
    [0.02, 0.98],
  ] as Point[]) {
    for (const motion of [
      [0.25, -0.2, 0.35, 0.03, -0.02, 0.05],
      [-0.24, 0.19, -0.32, -0.04, 0.02, -0.05],
    ]) {
      const point = predictRemoteGaze(
        result.model,
        cameraPlaneReading(target, motion, 20000)
      )!
      expect(point).not.toBeNull()
      expect(
        Math.hypot(point[0] - target[0], point[1] - target[1])
      ).toBeLessThan(0.02)
    }
  }
})
