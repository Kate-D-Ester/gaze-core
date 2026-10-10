import {
  createRemotePoseSupport,
  MAX_SPATIAL_FIT_ERROR,
  predictRemoteGaze,
  projectRemoteMapping,
  remoteFeatureVersion,
  trainRemoteMapping,
  validObservation,
} from "./calibration"
import { collectRemoteHeadHold } from "./head-motion-calibration"
import { isRemoteCalibration } from "./calibration-profile-adapter"
import {
  personalizedFeatures,
  personalizedFeatureVersion,
} from "./personalized-features"
import type {
  MotionFitScore,
  MotionFitReadings,
  RemoteMapping,
} from "./joint-motion-calibration.types"
import type {
  CalibrationSample,
  PersonalizedInputKind,
  RemoteCalibration,
} from "./remote-eye-tracking.types"

const REGULARIZATION = [0.001, 0.01, 0.1, 1, 10]
const MOTION_BLOCKS = 4

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function meanSquaredError(
  model: RemoteMapping,
  samples: CalibrationSample[]
): number {
  return mean(
    samples.map((sample) => {
      const point = projectRemoteMapping(model, sample.observation.feature!)
      return (
        (point[0] - sample.target[0]) ** 2 + (point[1] - sample.target[1]) ** 2
      )
    })
  )
}

function varianceOfMean(values: number[]): number {
  const average = mean(values)
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1)
  return variance / values.length
}

/** A steadier center hold must not be purchased by suppressing actual eye movement. */
function preservesGazeResponse(
  model: RemoteMapping,
  grid: CalibrationSample[]
): boolean {
  const keys = [...new Set(grid.map((sample) => sample.target.join(",")))]
  const groups = keys.map((key) =>
    grid.filter((sample) => sample.target.join(",") === key)
  )
  for (const axis of [0, 1]) {
    const targets = groups.map((group) => group[0]!.target[axis]!)
    const predictions = groups.map((group) =>
      mean(
        group.map(
          (sample) =>
            projectRemoteMapping(model, sample.observation.feature!)[axis]!
        )
      )
    )
    const targetMean = mean(targets)
    const predictionMean = mean(predictions)
    const variance = targets.reduce(
      (sum, target) => sum + (target - targetMean) ** 2,
      0
    )
    const covariance = targets.reduce(
      (sum, target, index) =>
        sum + (target - targetMean) * (predictions[index]! - predictionMean),
      0
    )
    // Gain 1 covers the calibrated screen range; below .9 loses over 10% of it.
    const gain = covariance / variance
    if (variance <= 0 || !Number.isFinite(gain) || gain < 0.9) {
      return false
    }
  }
  return true
}

function transformedReadings(
  samples: CalibrationSample[],
  kind: PersonalizedInputKind | null
): CalibrationSample[] | null {
  if (kind === null) {
    return samples
  }
  const transformed: CalibrationSample[] = []
  for (const sample of samples) {
    const feature = personalizedFeatures(sample.observation, kind)
    if (!feature) {
      return null
    }
    transformed.push({
      ...sample,
      observation: { ...sample.observation, feature },
    })
  }
  return transformed
}

/** Whole gaze locations and contiguous motion blocks are independent fit checks. */
function scoreMapping(
  readings: MotionFitReadings,
  regularization: number
): MotionFitScore | null {
  const {
    baseline,
    grid,
    motion,
    kind,
    baselineBlocks,
    observedAxes,
    durationMs,
    sourceVersion,
  } = readings
  const targetKeys = [...new Set(grid.map((sample) => sample.target.join(",")))]
  const spatialErrors: number[] = []
  for (const key of targetKeys) {
    // A center fold must exclude the center motion hold as well. Otherwise its
    // known labels leak into the purportedly unseen spatial location.
    const training = [...grid, ...motion].filter(
      (sample) => sample.target.join(",") !== key
    )
    const fitted = trainRemoteMapping(training, regularization)
    if (!fitted) {
      return null
    }
    const heldOut = grid.filter((sample) => sample.target.join(",") === key)
    spatialErrors.push(meanSquaredError(fitted, heldOut))
  }
  const spatialRms = Math.sqrt(mean(spatialErrors))
  if (
    spatialRms > MAX_SPATIAL_FIT_ERROR ||
    spatialErrors.some((error) => Math.sqrt(error) > 0.5)
  ) {
    return null
  }
  const motionErrors: number[] = []
  for (let block = 0; block < MOTION_BLOCKS; block++) {
    const start = Math.floor((block * motion.length) / MOTION_BLOCKS)
    const end = Math.floor(((block + 1) * motion.length) / MOTION_BLOCKS)
    const fitted = trainRemoteMapping(
      [...grid, ...motion.slice(0, start), ...motion.slice(end)],
      regularization
    )
    if (!fitted) {
      return null
    }
    const error = meanSquaredError(fitted, motion.slice(start, end))
    if (Math.sqrt(error) > Math.sqrt(baselineBlocks[block]!) * 1.05 + 0.002) {
      return null
    }
    motionErrors.push(error)
  }
  const motionRms = Math.sqrt(mean(motionErrors))
  const baselineMotionRms = Math.sqrt(mean(baselineBlocks))
  if (
    motionRms > MAX_SPATIAL_FIT_ERROR ||
    motionRms > baselineMotionRms * 0.75 ||
    baselineMotionRms - motionRms < 0.003
  ) {
    return null
  }
  const fitted = trainRemoteMapping([...grid, ...motion], regularization)
  if (!fitted) {
    return null
  }
  if (!preservesGazeResponse(fitted, grid)) {
    return null
  }
  const first = grid[0]!.observation
  const model: RemoteCalibration = {
    ...fitted,
    mode: baseline.mode,
    regularization,
    featureVersion: sourceVersion,
    baseModelVersion: first.baseModelVersion,
    poseKind: first.pose!.kind,
    ...createRemotePoseSupport([...grid, ...motion]),
    targetCount: targetKeys.length,
    // Preserve the spatial sample-count contract; the motion hold has its own count.
    sampleCount: grid.length,
    crossValidationError: spatialRms,
    motionFit: {
      version: "joint-motion-v1",
      spatialRms,
      motionRms,
      baselineMotionRms,
      observedAxes,
      sampleCount: motion.length,
      durationMs,
    },
  }
  if (kind !== null) {
    model.inputKind = kind
    model.representationVersion = personalizedFeatureVersion(kind)
  }
  if (!isRemoteCalibration(model)) {
    return null
  }
  return {
    model,
    // Equal emphasis on gaze coverage and fixed-gaze motion, independent of FPS.
    loss: (mean(spatialErrors) + mean(motionErrors)) / 2,
    standardError: Math.sqrt(
      (varianceOfMean(spatialErrors) + varianceOfMean(motionErrors)) / 4
    ),
  }
}

/** Learn the readout itself under motion rather than patching a high-gain frozen map. */
export function fitJointRemoteMotion(
  baseline: RemoteCalibration,
  input: CalibrationSample[],
  head: CalibrationSample[]
): RemoteCalibration | null {
  const hold = collectRemoteHeadHold(baseline, head)
  if (!hold) {
    return null
  }
  const grid = input.filter(
    (sample) =>
      validObservation(sample.observation) &&
      sample.observation.source !== "video"
  )
  if (
    grid.length < 27 ||
    grid.length / input.length < 0.8 ||
    new Set(grid.map((sample) => sample.target.join(","))).size < 9 ||
    grid.some(
      (sample) => predictRemoteGaze(baseline, sample.observation) === null
    )
  ) {
    return null
  }
  const motion = hold.samples
  const baselineBlocks: number[] = []
  for (let block = 0; block < MOTION_BLOCKS; block++) {
    const heldOut = motion.slice(
      Math.floor((block * motion.length) / MOTION_BLOCKS),
      Math.floor(((block + 1) * motion.length) / MOTION_BLOCKS)
    )
    baselineBlocks.push(
      mean(
        heldOut.map((sample) => {
          const point = predictRemoteGaze(baseline, sample.observation)!
          return (
            (point[0] - sample.target[0]) ** 2 +
            (point[1] - sample.target[1]) ** 2
          )
        })
      )
    )
  }
  const kinds: (PersonalizedInputKind | null)[] = [null]
  if (baseline.poseKind === "face") {
    kinds.push(baseline.mode === "ir" ? "binocular" : "appearance")
    if (baseline.mode === "ir") {
      kinds.push("binocular-camera")
    }
  }
  const candidates: MotionFitScore[] = []
  for (const kind of kinds) {
    const transformedGrid = transformedReadings(grid, kind)
    const transformedMotion = transformedReadings(motion, kind)
    if (!transformedGrid || !transformedMotion) {
      continue
    }
    for (const regularization of REGULARIZATION) {
      const score = scoreMapping(
        {
          baseline,
          grid: transformedGrid,
          motion: transformedMotion,
          kind,
          baselineBlocks,
          observedAxes: hold.observedAxes,
          durationMs: hold.durationMs,
          sourceVersion: remoteFeatureVersion(grid[0]!.observation),
        },
        regularization
      )
      if (score && Number.isFinite(score.loss)) {
        candidates.push(score)
      }
    }
  }
  if (!candidates.length) {
    return null
  }
  const best = candidates.reduce((best, candidate) =>
    candidate.loss < best.loss ? candidate : best
  )
  // One-standard-error rule: prefer a less sensitive ridge fit when the
  // held-out evidence cannot distinguish it from the minimum-error candidate.
  const comparable = candidates.filter(
    (candidate) => candidate.loss <= best.loss + best.standardError
  )
  comparable.sort(
    (left, right) =>
      right.model.regularization - left.model.regularization ||
      left.loss - right.loss
  )
  return comparable[0]!.model
}

export function hasRemoteHeadCompensation(
  model: RemoteCalibration | null | undefined
): boolean {
  return Boolean(model?.motionFit || model?.headCorrection)
}
