import { expect, test } from "bun:test"
import {
  createAdaptiveCalibration,
  finishAdaptiveCapture,
} from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration"
import {
  CALIBRATION_TARGETS,
  fitRemoteCalibration,
  predictRemoteGaze,
} from "../../apps/web/src/features/remote-eye-tracking/calibration"
import { isRemoteCalibration } from "../../apps/web/src/features/remote-eye-tracking/calibration-profile-adapter"
import { fitBasePointCalibration } from "../../apps/web/src/features/remote-eye-tracking/base-point-calibration"
import { buildIrFaceFeatures } from "../../apps/web/src/features/remote-eye-tracking/ir-face-features"
import {
  buildRgbFeatures,
  inspectRgbFace,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import { face } from "./face-fixture"
import type { IrFeatureStrategy } from "../../research/calibration/ocular-axes.types"
import type { RgbFaceGeometry } from "../../apps/web/src/features/remote-eye-tracking/rgb-features.types"
import type {
  CalibrationSample,
  Point,
  RemoteObservation,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

const viewport = { width: 1200, height: 800 }

test("baseline feature calibration retains the neural source contract", () => {
  const input = setup(false)
  const model = fitRemoteCalibration("webcam", input)!
  expect(model).not.toBeNull()
  expect(model.baseModelVersion).toBe("blazegaze-v1")
  expect(isRemoteCalibration(model)).toBe(true)
  const differentNetwork = {
    ...input[0]!.observation,
    baseModelVersion: "different-network-v2",
  }
  expect(predictRemoteGaze(model, differentNetwork)).toBeNull()
  input[0]!.observation = differentNetwork
  expect(fitRemoteCalibration("webcam", input)).toBeNull()
})

test("feature and personalized profiles remain loadable", () => {
  const input = setup(false)
  const featureModel = fitRemoteCalibration("webcam", input)!
  const neuralModel = fitBasePointCalibration("webcam", input)!
  expect(featureModel).not.toBeNull()
  expect(neuralModel).not.toBeNull()
  expect(isRemoteCalibration(featureModel)).toBe(true)
  expect(isRemoteCalibration(neuralModel)).toBe(true)
})

function observation(
  target: Point,
  group = 0,
  frame = 0,
  drift = true,
  irisResponse = true,
  mode: "webcam" | "mobile" = "webcam"
): RemoteObservation {
  const basePoint: Point = [
    0.5 + 0.005 * (target[0] - 0.5),
    0.5 + 0.005 * (target[1] - 0.5),
  ]
  if (drift) {
    // The network's lighting/appearance drift is larger than its eye response.
    basePoint[0] += 0.03 * Math.sin(group * 2.8)
    basePoint[1] += 0.03 * Math.cos(group * 1.9)
  }
  const geometry: RgbFaceGeometry = {
    valid: true,
    landmarks: [],
    normalizedLandmarks: [],
    eyes: [],
    faceBox: { x: 0, y: 0, width: 640, height: 480 },
    pose: {
      kind: "face",
      yaw: 0,
      pitch: 0,
      roll: 0,
      x: 0.5,
      y: 0.5,
      scale: 0.2,
    },
    irisOffsets: [
      (target[0] - 0.5) * 0.12,
      (target[1] - 0.5) * 0.08,
      (target[0] - 0.5) * 0.12,
      (target[1] - 0.5) * 0.08,
    ],
    rotation: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    legacyModelRotation: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    legacyModelScale: 1,
    quality: 0.9,
  }
  if (!irisResponse) {
    geometry.irisOffsets = [0, 0, 0, 0]
  }
  return {
    timestamp: group * 10000 + frame * 100,
    width: 640,
    height: 480,
    quality: 0.9,
    reason: null,
    feature: buildRgbFeatures(mode, geometry, basePoint),
    basePoint,
    baseModelVersion: "blazegaze-v1",
    pose: geometry.pose,
    eyes: [],
    faceBox: geometry.faceBox,
    method: "Synthetic weak neural response with measured binocular motion",
    processingMs: 1,
  }
}

function setup(
  drift = true,
  irisResponse = true,
  mode: "webcam" | "mobile" = "webcam"
): CalibrationSample[] {
  return CALIBRATION_TARGETS.flatMap((target, targetId) =>
    Array.from({ length: 18 }, (_, frame) => ({
      target,
      targetId,
      observation: observation(
        target,
        targetId,
        frame,
        drift,
        irisResponse,
        mode
      ),
    }))
  )
}

test.each(["webcam", "mobile"] as const)(
  "%s calibration retains the full gaze range when the appearance estimate is weak",
  (mode) => {
    const result = finishAdaptiveCapture(
      createAdaptiveCalibration(mode, false),
      setup(true, true, mode),
      viewport
    ).result
    expect(result).not.toBeNull()
    for (const target of [
      [0.02, 0.98],
      [0.98, 0.02],
      [0.17, 0.83],
      [0.73, 0.29],
    ] as Point[]) {
      const point = predictRemoteGaze(
        result!.model,
        observation(target, 0, 0, false, true, mode)
      )!
      expect(point).not.toBeNull()
      expect(point[0]).toBeCloseTo(target[0], 2)
      expect(point[1]).toBeCloseTo(target[1], 2)
    }
    expect(result!.accuracyVerified).toBe(false)
    expect(isRemoteCalibration(JSON.parse(JSON.stringify(result!.model)))).toBe(
      true
    )
    const wrongNetwork = observation([0.2, 0.8], 0, 0, false, true, mode)
    wrongNetwork.baseModelVersion = "different-network-v2"
    expect(predictRemoteGaze(result!.model, wrongNetwork)).toBeNull()
    expect(
      isRemoteCalibration({
        ...result!.model,
        baseModelVersion: "different-network-v2",
      })
    ).toBe(false)
  }
)

test("calibration cannot claim a usable mapping when neither input tracks target direction", () => {
  const input = setup(true, false)
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    input,
    viewport
  )
  expect(state.phase).toBe("failed")
  expect(Boolean(state.result)).toBe(false)
  expect(state.failure?.fitIssue).toBe("insufficient-response")
})

test("a constant neural estimate can use measured binocular motion instead", () => {
  const input = setup()
  for (const sample of input) {
    sample.observation.basePoint = [0.5, 0.5]
    sample.observation.feature![0] = 0
    sample.observation.feature![1] = 0
  }
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    input,
    viewport
  )
  expect(state.phase).toBe("complete")
  const live = observation([0.04, 0.96], 0, 0, false)
  live.basePoint = [0.5, 0.5]
  live.feature![0] = 0
  live.feature![1] = 0
  const point = predictRemoteGaze(state.result!.model, live)!
  expect(point[0]).toBeCloseTo(0.04, 2)
  expect(point[1]).toBeCloseTo(0.96, 2)
})

test("a reliable compressed neural estimate keeps its full range", () => {
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    setup(false),
    viewport
  )
  expect(state.phase).toBe("complete")
  const model = state.result!.model
  expect(model.inputKind).toBe("base-point")
  const point = predictRemoteGaze(
    model,
    observation([0.01, 0.99], 0, 0, false)
  )!
  expect(point[0]).toBeCloseTo(0.01, 6)
  expect(point[1]).toBeCloseTo(0.99, 6)
})

test("binocular fallback still spans the screen with noisy fixation readings", () => {
  const input = setup()
  for (const sample of input) {
    const noise = Math.sin(sample.observation.timestamp * 0.01) * 0.002
    for (const axis of [2, 3, 4, 5]) {
      sample.observation.feature![axis] += noise
    }
    for (const axis of [23, 24, 25, 26]) {
      sample.observation.feature![axis] += noise * 5
    }
  }
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    input,
    viewport
  )
  expect(state.phase).toBe("complete")
  for (const target of [
    [0.03, 0.97],
    [0.97, 0.03],
  ] as Point[]) {
    const point = predictRemoteGaze(
      state.result!.model,
      observation(target, 0, 0, false)
    )!
    expect(Math.abs(point[0] - target[0])).toBeLessThan(0.02)
    expect(Math.abs(point[1] - target[1])).toBeLessThan(0.02)
  }
})

function irObservation(
  target: Point,
  strategy: IrFeatureStrategy
): RemoteObservation {
  const geometry = inspectRgbFace(face(), 640, 480)
  if (!geometry.valid) {
    throw new Error(geometry.reason)
  }
  const horizontal = 0.12 * (target[0] - 0.5)
  const vertical = 0.08 * (target[1] - 0.5)
  const features = buildIrFaceFeatures(
    geometry,
    [
      [249.6 + horizontal * 51.2, 201.6 + vertical * 51.2],
      [390.4 + horizontal * 51.2, 201.6 + vertical * 51.2],
    ],
    strategy
  )!
  return {
    ...observation(target),
    feature: features.feature,
    featureVersion: features.featureVersion,
    basePoint: null,
    baseModelVersion: undefined,
    pose: geometry.pose,
  }
}

test.each(["legacy", "camera-axes-v2"] as const)(
  "measured IR binocular motion retains the full screen range: %s",
  (strategy) => {
    const input = CALIBRATION_TARGETS.flatMap((target, targetId) =>
      Array.from({ length: 18 }, () => ({
        target,
        targetId,
        observation: irObservation(target, strategy),
      }))
    )
    const state = finishAdaptiveCapture(
      createAdaptiveCalibration("ir", false),
      input,
      viewport
    )
    expect(state.phase).toBe("complete")
    for (const target of [
      [0.01, 0.99],
      [0.99, 0.01],
    ] as Point[]) {
      const point = predictRemoteGaze(
        state.result!.model,
        irObservation(target, strategy)
      )!
      expect(point[0]).toBeCloseTo(target[0], 2)
      expect(point[1]).toBeCloseTo(target[1], 2)
    }
  }
)

test("a source version change cannot trigger fallback to incompatible readings", () => {
  const input = setup()
  input[0]!.observation.featureVersion = "unknown-version"
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    input,
    viewport
  )
  expect(state.phase).toBe("failed")
  expect(state.failure?.fitIssue).toBe("incompatible-readings")
})

test("RGB fallback fits only readings from the supported neural model", () => {
  const supported = setup()
  const incompatible = setup()
  for (const sample of incompatible) {
    sample.observation.baseModelVersion = "different-network-v2"
  }
  const state = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    [...supported, ...incompatible],
    viewport
  )
  expect(state.phase).toBe("complete")
  expect(state.result!.model.sampleCount).toBe(162)
  const point = predictRemoteGaze(
    state.result!.model,
    observation([0.04, 0.96], 0, 0, false)
  )!
  expect(point[0]).toBeCloseTo(0.04, 2)
  expect(point[1]).toBeCloseTo(0.96, 2)
})
