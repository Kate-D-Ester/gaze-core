import { expect, test } from "bun:test"
import {
  createAdaptiveCalibration,
  finishAdaptiveCapture,
  PERSONAL_TARGETS,
} from "../../apps/web/src/features/remote-eye-tracking/adaptive-calibration"
import { predictRemoteGaze } from "../../apps/web/src/features/remote-eye-tracking/calibration"
import { isRemoteCalibration } from "../../apps/web/src/features/remote-eye-tracking/calibration-profile-adapter"
import {
  readCalibrationProfiles,
  saveCalibrationProfile,
} from "../../apps/web/src/features/tracking-calibration/calibration-profiles"
import { fitPersonalizedCalibration } from "../../apps/web/src/features/remote-eye-tracking/calibration"
import type {
  CalibrationSample,
  Point,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

function capture(
  targets: Point[],
  goodLatent = true,
  phase = 0
): CalibrationSample[] {
  return targets.flatMap((target, targetId) =>
    Array.from({ length: 24 }, (_, frame) => {
      const yaw = 0.25 * Math.sin((frame + phase) * 0.8)
      const pitch = 0.2 * Math.cos((frame + phase) * 0.6)
      const feature = Array<number>(29).fill(0)
      const basePoint: Point = [
        0.5 + 0.3 * Math.sin(frame),
        0.5 + 0.3 * Math.cos(frame),
      ]
      const embedding = Array<number>(16).fill(0)
      if (goodLatent) {
        embedding[0] = target[0] + 0.3 * yaw
        embedding[1] = target[1] - 0.4 * pitch
      } else {
        // Same irrelevant signal at every target; no target-ID leakage.
        embedding[0] = Math.sin(frame * 1.4)
        embedding[1] = Math.cos(frame * 1.7)
        basePoint[0] = target[0]
        basePoint[1] = target[1]
      }
      return {
        target,
        targetId,
        observation: {
          timestamp: targetId * 10000 + frame * 50,
          width: 640,
          height: 480,
          feature,
          basePoint,
          baseModelVersion: "blazegaze-v1",
          quality: 0.9,
          appearanceEmbedding: embedding,
          appearanceVersion: "blazegaze-dense16-v1",
          reason: null,
          pose: {
            kind: "face" as const,
            yaw,
            pitch,
            roll: 0,
            x: 0.5,
            y: 0.5,
            scale: 0.2,
          },
          eyes: [],
          faceBox: null,
          method: "Labeled synthetic latent fixture",
          processingMs: 1,
        },
      }
    })
  )
}

test.each(["webcam", "mobile"] as const)(
  "%s can personalize appearance when the generic output has no usable gaze response",
  (mode) => {
    const result = finishAdaptiveCapture(
      createAdaptiveCalibration(mode, false),
      capture(PERSONAL_TARGETS),
      { width: 1200, height: 800 }
    )
    expect(result.phase).toBe("complete")
    const model = result.result!.model
    expect(model.inputKind).toBe("appearance")
    expect(model.targetCount).toBe(9)
    expect(isRemoteCalibration(model)).toBe(true)
    const saved = JSON.parse(JSON.stringify(model))
    const storage = new Map<string, string>()
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }
    saveCalibrationProfile(
      {
        id: "appearance",
        name: "Personal appearance",
        updatedAt: new Date(0).toISOString(),
        context: {
          version: 1,
          tracker: mode,
          featureVersion: "legacy-29",
          cameraIdentity: "a".repeat(64),
          width: 640,
          height: 480,
          inputTransform: "camera-raw",
          outputSpace: "screen",
          screenAspect: 1.5,
          setupKey: "fixture",
          geometryId: null,
        },
        offset: [0, 0],
        payload: { kind: "remote", model },
      },
      adapter
    )
    expect(readCalibrationProfiles(adapter).profiles[0]?.payload).toEqual({
      kind: "remote",
      model,
    })
    for (const sample of capture(
      [
        [0.02, 0.98],
        [0.97, 0.03],
        [0.33, 0.71],
      ],
      true,
      17.4
    )) {
      const predicted = predictRemoteGaze(saved, sample.observation)!
      expect(predicted).not.toBeNull()
      expect(
        Math.hypot(
          predicted[0] - sample.target[0],
          predicted[1] - sample.target[1]
        )
      ).toBeLessThan(0.015)
    }
    const lost = capture([[0.5, 0.5]])[0]!.observation
    lost.appearanceEmbedding = undefined
    expect(predictRemoteGaze(saved, lost)).toBeNull()
    const incompatible = capture([[0.5, 0.5]])[0]!.observation
    incompatible.appearanceVersion = "unknown"
    expect(predictRemoteGaze(saved, incompatible)).toBeNull()
    expect(
      isRemoteCalibration({ ...model, representationVersion: "unknown" })
    ).toBe(false)
  }
)

test("a new representation cannot merge incompatible camera features", () => {
  const samples = capture(PERSONAL_TARGETS)
  samples[0]!.observation.featureVersion = "another-pipeline"
  expect(fitPersonalizedCalibration("webcam", samples, "appearance")).toBeNull()
})

test("IR cannot calibrate from head motion while the measured eyes have no response", () => {
  const samples = capture(PERSONAL_TARGETS).map((sample) => ({
    ...sample,
    observation: {
      ...sample.observation,
      baseModelVersion: undefined,
      appearanceEmbedding: undefined,
      pose: {
        ...sample.observation.pose!,
        yaw: sample.target[0],
        pitch: sample.target[1],
      },
    },
  }))
  expect(fitPersonalizedCalibration("ir", samples, "binocular")).toBeNull()
})

test("binocular IR readout separates projected eye motion and head rotation on unseen target/pose combinations", () => {
  function irCapture(targets: Point[], phase: number): CalibrationSample[] {
    return capture(targets, true, phase).map((sample) => {
      const pose = sample.observation.pose!
      const yaw = pose.yaw! * 2
      const pitch = pose.pitch! * 2
      const x = (sample.target[0] - 0.5) * 0.2 - yaw * 0.12
      const y = (sample.target[1] - 0.5) * 0.2 + pitch * 0.1
      const projectedY = (y * Math.cos(pitch)) / Math.cos(yaw)
      const projectedX = x - Math.sin(yaw) * Math.tan(pitch) * projectedY
      const feature = Array<number>(29).fill(0)
      feature.splice(
        0,
        10,
        projectedX,
        projectedY,
        projectedX,
        projectedY,
        yaw,
        pitch,
        0,
        0,
        0,
        Math.log(0.2)
      )
      return {
        ...sample,
        observation: {
          ...sample.observation,
          feature,
          baseModelVersion: undefined,
          appearanceEmbedding: undefined,
          pose: { ...pose, yaw, pitch },
        },
      }
    })
  }
  const model = fitPersonalizedCalibration(
    "ir",
    irCapture(PERSONAL_TARGETS, 0),
    "binocular"
  )!
  expect(model).not.toBeNull()
  expect(isRemoteCalibration(model)).toBe(true)
  const selected = finishAdaptiveCapture(
    createAdaptiveCalibration("ir", false),
    irCapture(PERSONAL_TARGETS, 0),
    { width: 1200, height: 800 }
  )
  expect(selected.result?.model.inputKind).toBe("binocular")
  for (const sample of irCapture(
    [
      [0.02, 0.98],
      [0.98, 0.02],
      [0.71, 0.38],
    ],
    17.4
  )) {
    const point = predictRemoteGaze(model, sample.observation)!
    expect(point).not.toBeNull()
    expect(
      Math.hypot(point[0] - sample.target[0], point[1] - sample.target[1])
    ).toBeLessThan(0.015)
  }
})

test("noise or incomplete appearance never displaces a working mapping", () => {
  for (const incomplete of [false, true]) {
    const samples = capture(PERSONAL_TARGETS, false)
    if (incomplete) samples[10]!.observation.appearanceEmbedding = undefined
    const result = finishAdaptiveCapture(
      createAdaptiveCalibration("webcam", false),
      samples,
      { width: 1200, height: 800 }
    )
    expect(result.phase).toBe("complete")
    expect(result.result!.model.inputKind).toBe("base-point")
  }
})

function irisCapture(targets: Point[], phase = 0): CalibrationSample[] {
  return capture(targets, false, phase).map((sample, index) => {
    const target = sample.target
    const noise = 0.012 * Math.sin(index * 0.91 + phase)
    const x = (target[0] - 0.5) * 0.25
    const y = (target[1] - 0.5) * 0.25
    const observation = sample.observation
    observation.basePoint = [0.5, 0.5]
    observation.appearanceEmbedding = Array(16).fill(0)
    observation.feature = Array(29).fill(0)
    observation.feature.splice(2, 4, x + noise, y - noise, x + noise, y - noise)
    observation.pose = {
      kind: "face",
      yaw: 0,
      pitch: 0,
      roll: 0,
      x: 0.5,
      y: 0.5,
      scale: 0.2,
    }
    observation.irisRefinement = {
      version: "rgb-iris-boundary-v1",
      offsets: [x, y, x, y],
      confidence: [0.9, 0.9],
    }
    return sample
  })
}

test("pixel-refined calibration must beat the current mapping and preserve a usable landmark fallback", () => {
  const samples = irisCapture(PERSONAL_TARGETS)
  const result = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    samples,
    { width: 1200, height: 800 }
  )
  const model = result.result!.model
  expect(model.inputKind).toBe("appearance-refined")
  expect(isRemoteCalibration(JSON.parse(JSON.stringify(model)))).toBe(true)
  for (const sample of irisCapture(
    [
      [0.02, 0.98],
      [0.98, 0.02],
      [0.4, 0.6],
    ],
    4.8
  )) {
    const point = predictRemoteGaze(model, sample.observation)!
    expect(
      Math.hypot(point[0] - sample.target[0], point[1] - sample.target[1])
    ).toBeLessThan(0.02)
    const fallback = structuredClone(sample.observation)
    fallback.irisRefinement!.offsets = fallback.feature!.slice(2, 6) as [
      number,
      number,
      number,
      number,
    ]
    fallback.irisRefinement!.confidence = [0, 0]
    const fallbackPoint = predictRemoteGaze(model, fallback)!
    expect(fallbackPoint).not.toBeNull()
    expect(
      Math.hypot(
        fallbackPoint[0] - sample.target[0],
        fallbackPoint[1] - sample.target[1]
      )
    ).toBeLessThan(0.09)
    fallback.irisRefinement!.version = "unknown"
    expect(predictRemoteGaze(model, fallback)).toBeNull()
  }
})

test("pixel refinement cannot replace a mapping if losing its boundaries would produce a large bias", () => {
  const samples = irisCapture(PERSONAL_TARGETS)
  for (const sample of samples) {
    const offsets = sample.observation.irisRefinement!.offsets
    offsets[0] += 0.1
    offsets[2] += 0.1
  }
  const result = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    samples,
    { width: 1200, height: 800 }
  )
  expect(result.phase).toBe("complete")
  expect(result.result!.model.inputKind).not.toBe("appearance-refined")
})

test("intermittent boundary loss cannot introduce jitter between two individually stable estimates", () => {
  const samples = irisCapture(PERSONAL_TARGETS)
  for (const sample of samples) {
    const [x, y] = sample.observation.irisRefinement!.offsets
    const column = sample.target[0] === 0.5 ? -2 : 1
    const row = sample.target[1] === 0.5 ? -2 : 1
    const error = 0.005 * column * row
    sample.observation.feature!.splice(2, 4, x + error, y, x + error, y)
  }
  const result = finishAdaptiveCapture(
    createAdaptiveCalibration("webcam", false),
    samples,
    { width: 1200, height: 800 }
  )
  expect(result.phase).toBe("complete")
  expect(result.result!.model.inputKind).not.toBe("appearance-refined")
})
