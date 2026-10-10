import { expect, test } from "bun:test"
import {
  poseSupported,
  predictRemoteGaze,
  predictRemoteGazeWithoutHeadCorrection,
} from "../../apps/web/src/features/remote-eye-tracking/calibration"
import { isRemoteCalibration } from "../../apps/web/src/features/remote-eye-tracking/calibration-profile-adapter"
import { fitRemoteHeadCorrection } from "../../apps/web/src/features/remote-eye-tracking/head-motion-calibration"
import { RGB_BASE_MODEL_VERSION } from "../../apps/web/src/features/remote-eye-tracking/rgb-model-version"
import type {
  CalibrationSample,
  HeadPose,
  Point,
  RemoteCalibration,
  RemoteObservation,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

const reference = [0.1, -0.05, 0.03, 0.5, 0.5, Math.log(0.2)]
const slopes = [
  [0.26, -0.12, 0.13, 0.9, -0.4, 0.18],
  [-0.09, 0.31, -0.15, 0.3, 0.85, -0.2],
]
function calibration(): RemoteCalibration {
  return {
    mode: "webcam",
    inputKind: "base-point",
    spatialBasis: "affine",
    baseModelVersion: RGB_BASE_MODEL_VERSION,
    featureVersion: "synthetic-v1",
    featureMean: [0, 0],
    featureScale: [1, 1],
    coefficients: [
      [0, 1, 0],
      [0, 0, 1],
    ],
    regularization: 0.01,
    crossValidationError: 0,
    poseKind: "face",
    poseSamples: [reference],
    poseBounds: { min: reference, max: reference },
    targetCount: 9,
    sampleCount: 162,
  }
}
function pose(delta: number[]): HeadPose {
  const values = delta.map((value, axis) => value + reference[axis]!)
  return {
    kind: "face",
    yaw: values[0]!,
    pitch: values[1]!,
    roll: values[2]!,
    x: values[3]!,
    y: values[4]!,
    scale: Math.exp(values[5]!),
  }
}
function observation(
  delta: number[],
  target: Point = [0.5, 0.5],
  timestamp = 0,
  noise: Point = [0, 0]
): RemoteObservation {
  const bias = slopes.map((row, axis) =>
    row.reduce(
      (sum, value, column) => sum + value * delta[column]!,
      noise[axis]!
    )
  ) as Point
  return {
    timestamp,
    width: 1280,
    height: 720,
    quality: 0.9,
    reason: null,
    eyes: [],
    faceBox: null,
    method: "synthetic",
    processingMs: 1,
    featureVersion: "synthetic-v1",
    feature: [0, 0],
    baseModelVersion: RGB_BASE_MODEL_VERSION,
    basePoint: [target[0] + bias[0], target[1] + bias[1]],
    pose: pose(delta),
  }
}
function motion(index: number): number[] {
  const phase = (index * Math.PI) / 15
  return [
    0.15 * Math.sin(phase),
    0.12 * Math.cos(phase),
    0.1 * Math.sin(phase * 2 + 0.4),
    0.05 * Math.cos(phase * 2 + 0.9),
    0.04 * Math.sin(phase * 3),
    0.08 * Math.cos(phase * 3 + 0.3),
  ]
}
function samples(deltaAt = motion, noisy = false): CalibrationSample[] {
  return Array.from({ length: 120 }, (_, index) => ({
    target: [0.5, 0.5],
    targetId: 0,
    observation: observation(
      deltaAt(index),
      [0.5, 0.5],
      index * 50,
      noisy
        ? [0.004 * Math.sin(index * 2.7), 0.004 * Math.cos(index * 2.3)]
        : [0, 0]
    ),
  }))
}

test("learned six-axis residual improves fixed-target motion and unseen targets without shifting neutral gaze", () => {
  const model = calibration()
  const input = samples()
  const before = JSON.stringify({ model, input })
  const fitted = fitRemoteHeadCorrection(model, input)!
  expect(fitted).not.toBeNull()
  expect(fitted.headCorrection!.observedAxes).toEqual([0, 1, 2, 3, 4, 5])
  expect(fitted.headCorrection!.correctedRms).toBeLessThan(
    fitted.headCorrection!.baselineRms * 0.1
  )
  expect(fitted.coefficients).toEqual(model.coefficients)
  expect(fitted.poseSamples).toEqual(model.poseSamples)
  expect(JSON.stringify({ model, input })).toBe(before)
  const neutral = observation([0, 0, 0, 0, 0, 0], [0.23, 0.79])
  expect(predictRemoteGaze(fitted, neutral)).toEqual(
    predictRemoteGaze(model, neutral)
  )
  for (const target of [
    [0.12, 0.87],
    [0.87, 0.16],
    [0.5, 0.5],
  ] as Point[]) {
    const obs = observation(motion(7.3), target)
    const spatial = predictRemoteGazeWithoutHeadCorrection(fitted, obs)!
    const corrected = predictRemoteGaze(fitted, obs)!
    expect(
      Math.hypot(corrected[0] - target[0], corrected[1] - target[1])
    ).toBeLessThan(0.003)
    expect(
      Math.hypot(spatial[0] - target[0], spatial[1] - target[1])
    ).toBeGreaterThan(0.03)
  }
  expect(isRemoteCalibration(JSON.parse(JSON.stringify(fitted)))).toBe(true)
  const featureResidual = {
    ...fitted,
    inputKind: undefined,
    spatialBasis: undefined,
    baseModelVersion: undefined,
  }
  expect(isRemoteCalibration(featureResidual)).toBe(true)
})
for (const axis of [0, 2, 3, 4, 5]) {
  test(`head residual learns only observed axis ${axis}`, () => {
    const input = samples((index) => {
      const delta = [0, 0, 0, 0, 0, 0]
      delta[axis] =
        (axis === 3 || axis === 4 ? 0.06 : 0.2) *
        Math.sin((index * Math.PI) / 15)
      return delta
    })
    const fitted = fitRemoteHeadCorrection(calibration(), input)!
    expect(fitted).not.toBeNull()
    expect(fitted.headCorrection!.observedAxes).toEqual([axis])
    expect(
      fitted.headCorrection!.coefficients.every((row) =>
        row.every((value, index) => index === axis || value === 0)
      )
    ).toBe(true)
    expect(fitted.headCorrection!.correctedRms).toBeLessThan(0.002)
  })
}

test("regularization handles noisy correlated head axes on held-out motion", () => {
  const deltaAt = (index: number): number[] => {
    const yaw = 0.18 * Math.sin((index * Math.PI) / 15)
    return [yaw, 0, 0, 0.4 * yaw + 0.001 * Math.cos(index * 2.4), 0, 0]
  }
  const fitted = fitRemoteHeadCorrection(calibration(), samples(deltaAt, true))!
  expect(fitted).not.toBeNull()
  expect(fitted.headCorrection!.observedAxes).toEqual([0, 3])
  expect(fitted.headCorrection!.correctedRms).toBeLessThan(0.007)
  const target: Point = [0.24, 0.76]
  const predicted = predictRemoteGaze(
    fitted,
    observation(deltaAt(10.2), target)
  )!
  expect(
    Math.hypot(predicted[0] - target[0], predicted[1] - target[1])
  ).toBeLessThan(0.005)
})

test("nuisance center offset cannot shift the neutral spatial mapping", () => {
  const fitted = fitRemoteHeadCorrection(
    calibration(),
    samples().map((sample) => ({
      ...sample,
      observation: {
        ...sample.observation,
        basePoint: [
          sample.observation.basePoint![0] + 0.007,
          sample.observation.basePoint![1] - 0.004,
        ],
      },
    }))
  )!
  expect(fitted).not.toBeNull()
  const neutral = observation(
    [0, 0, 0, 0, 0, 0],
    [0.5, 0.5],
    0,
    [0.007, -0.004]
  )
  expect(predictRemoteGaze(fitted, neutral)).toEqual(
    predictRemoteGazeWithoutHeadCorrection(fitted, neutral)
  )
  expect(predictRemoteGaze(fitted, neutral)).toEqual([0.507, 0.496])
})

test("head fit rejects stationary, tiny motion, constant bias, nonsense, and harmful temporal relations", () => {
  expect(
    fitRemoteHeadCorrection(
      calibration(),
      samples(() => [0, 0, 0, 0, 0, 0])
    )
  ).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      calibration(),
      samples(() => [0.001, 0, 0, 0, 0, 0])
    )
  ).toBeNull()
  const constant = samples().map((sample) => ({
    ...sample,
    observation: { ...sample.observation, basePoint: [0.59, 0.54] as Point },
  }))
  expect(fitRemoteHeadCorrection(calibration(), constant)).toBeNull()
  const nonsense = samples().map((sample, index) => ({
    ...sample,
    observation: {
      ...sample.observation,
      basePoint: [
        0.5 + 0.1 * Math.sin(index * 2.73),
        0.5 + 0.1 * Math.cos(index * 2.47),
      ] as Point,
    },
  }))
  expect(fitRemoteHeadCorrection(calibration(), nonsense)).toBeNull()
  const harmful = samples((index) => [
    0.18 * Math.sin((index * Math.PI) / 15),
    0,
    0,
    0,
    0,
    0,
  ]).map((sample, index) => ({
    ...sample,
    observation: {
      ...sample.observation,
      basePoint: [
        0.5 + (index < 90 ? 1 : -1) * (sample.observation.basePoint![0] - 0.5),
        0.5,
      ] as Point,
    },
  }))
  expect(fitRemoteHeadCorrection(calibration(), harmful)).toBeNull()
})

test("head fit needs same known center, unique observations, continuous time and compatible valid detections", () => {
  const model = calibration()
  const input = samples()
  expect(fitRemoteHeadCorrection(model, input.slice(0, 40))).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      model,
      input.map((sample) => ({
        ...sample,
        observation: { ...sample.observation, timestamp: 100 },
      }))
    )
  ).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      model,
      input.map((sample) => ({ ...sample, target: [0.6, 0.5] }))
    )
  ).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      model,
      input.map((sample) => ({
        ...sample,
        observation: {
          ...sample.observation,
          timestamp: sample.observation.timestamp / 10,
        },
      }))
    )
  ).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      model,
      input.map((sample, index) => ({
        ...sample,
        observation: {
          ...sample.observation,
          timestamp: sample.observation.timestamp + (index >= 60 ? 1000 : 0),
        },
      }))
    )
  ).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      model,
      input.map((sample) => ({
        ...sample,
        observation: { ...sample.observation, baseModelVersion: "wrong" },
      }))
    )
  ).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      model,
      input.map((sample, index) => ({
        ...sample,
        observation: {
          ...sample.observation,
          reason: index < 30 ? "lost eyes" : null,
        },
      }))
    )
  ).toBeNull()
  expect(
    fitRemoteHeadCorrection(
      model,
      input.map((sample) => ({
        ...sample,
        observation: { ...sample.observation, source: "video" },
      }))
    )
  ).toBeNull()
})

test("learned pose coverage excludes rejected frames and capped output remains visible beyond coverage", () => {
  const model = calibration()
  const input = samples().map((sample, index) =>
    index === 30
      ? {
          ...sample,
          observation: {
            ...sample.observation,
            pose: pose([2, 0, 0, 0, 0, 0]),
            reason: "lost eyes",
          },
        }
      : sample
  )
  const fitted = fitRemoteHeadCorrection(model, input)!
  expect(fitted).not.toBeNull()
  expect(fitted.headCorrection!.sampleCount).toBe(119)
  expect(fitted.headCorrection!.poseBounds.max[0]).toBeLessThan(0.3)
  const observed = observation(motion(7))
  expect(poseSupported(model, observed.pose)).toBe(false)
  expect(poseSupported(fitted, observed.pose)).toBe(true)
  const far = observation([2, 0, 0, 0.7, 0, 1])
  expect(poseSupported(fitted, far.pose)).toBe(false)
  const raw = predictRemoteGazeWithoutHeadCorrection(fitted, far)!
  const corrected = predictRemoteGaze(fitted, far)!
  expect(corrected.every(Number.isFinite)).toBe(true)
  expect(
    Math.hypot(corrected[0] - raw[0], corrected[1] - raw[1])
  ).toBeLessThanOrEqual(0.251)
  const neighbour = predictRemoteGaze(
    fitted,
    observation([2.00001, 0, 0, 0.70001, 0, 1.00001])
  )!
  expect(
    Math.hypot(neighbour[0] - corrected[0], neighbour[1] - corrected[1])
  ).toBeLessThan(0.0001)
})

test("live output retains real observation/model guards after removing pose coverage suppression", () => {
  const model = calibration()
  const outside = observation([0.5, 0, 0, 0, 0, 0])
  expect(poseSupported(model, outside.pose)).toBe(false)
  expect(predictRemoteGaze(model, outside)).not.toBeNull()
  for (const invalid of [
    { ...outside, reason: "lost eyes" },
    { ...outside, quality: 0.2 },
    { ...outside, pose: null },
    { ...outside, feature: [NaN] },
    { ...outside, featureVersion: "wrong" },
    { ...outside, baseModelVersion: "wrong" },
    { ...outside, pose: { ...outside.pose!, kind: "eye-reference" as const } },
    { ...outside, pose: { ...outside.pose!, scale: 0 } },
  ]) {
    expect(predictRemoteGaze(model, invalid)).toBeNull()
  }
})

test("an identical head hold cannot replace an effective correction or invalidate its accuracy check", () => {
  const fitted = fitRemoteHeadCorrection(calibration(), samples())!
  expect(fitRemoteHeadCorrection(fitted, samples())).toBeNull()
})

test("a partial-axis retry cannot discard a working six-axis correction", () => {
  const fitted = fitRemoteHeadCorrection(calibration(), samples())!
  const yawOnly = samples((index) => [
    0.2 * Math.sin((index * Math.PI) / 15),
    0,
    0,
    0,
    0,
    0,
  ])
  expect(fitRemoteHeadCorrection(fitted, yawOnly)).toBeNull()
})

test("profile validation strictly checks spatial basis and learned head correction", () => {
  const fitted = fitRemoteHeadCorrection(calibration(), samples())!
  expect(isRemoteCalibration(fitted)).toBe(true)
  expect(
    isRemoteCalibration({
      ...calibration(),
      spatialBasis: undefined,
      headCorrection: undefined,
    })
  ).toBe(true)
  expect(
    isRemoteCalibration({
      ...calibration(),
      featureMean: [0.3, 0.4],
      featureScale: [0.2, 0.1],
    })
  ).toBe(true)
  const quadratic = {
    ...calibration(),
    spatialBasis: "quadratic",
    coefficients: [
      [0, 1, 0, 0.1, 0, 0],
      [0, 0, 1, 0, 0, 0.1],
    ],
  }
  expect(isRemoteCalibration(quadratic)).toBe(true)
  for (const malformed of [
    {
      ...quadratic,
      coefficients: [
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    { ...calibration(), spatialBasis: "cubic" },
    { ...calibration(), featureScale: [0, 1] },
    {
      ...calibration(),
      poseBounds: { min: [1, 1, 1, 1, 1, 1], max: [0, 0, 0, 0, 0, 0] },
    },
    { ...fitted, headCorrection: null },
    ...[
      { reference: [0] },
      { reference: [NaN, 0, 0, 0, 0, 0] },
      { scale: [0, 1, 1, 1, 1, 1] },
      { coefficients: [[0], [0]] },
      { observedAxes: [0, 0] },
      { observedAxes: [-1] },
      { observedAxes: [] },
      { poseSamples: [] },
      { sampleCount: 1 },
      { durationMs: 100 },
      { maxCorrection: Infinity },
      { maxCorrection: 2 },
      { correctedRms: fitted.headCorrection!.baselineRms },
      { unknown: true },
    ].map((changes) => ({
      ...fitted,
      headCorrection: { ...fitted.headCorrection, ...changes },
    })),
  ]) {
    expect(isRemoteCalibration(malformed)).toBe(false)
  }
  const oneAxis = fitRemoteHeadCorrection(
    calibration(),
    samples((index) => [0.2 * Math.sin((index * Math.PI) / 15), 0, 0, 0, 0, 0])
  )!
  expect(
    isRemoteCalibration({
      ...oneAxis,
      headCorrection: {
        ...oneAxis.headCorrection,
        coefficients: [
          [0.1, 0.2, 0, 0, 0, 0],
          [0.1, 0, 0, 0, 0, 0],
        ],
      },
    })
  ).toBe(false)
})
