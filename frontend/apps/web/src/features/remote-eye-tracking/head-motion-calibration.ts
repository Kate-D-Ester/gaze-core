import { fitScreenCoordinates } from "../eye-tracking/calibration-least-squares"
import {
  poseVector,
  predictRemoteGazeWithoutHeadCorrection,
} from "./calibration"
import type {
  HeadCorrectionFitScore,
  HeadResidualSample,
  RemoteHeadCorrection,
  RemoteMotionHold,
} from "./head-motion-calibration.types"
import type {
  CalibrationSample,
  HeadPose,
  Point,
  RemoteCalibration,
} from "./remote-eye-tracking.types"

export const MIN_HEAD_CORRECTION_SAMPLES = 48
const MIN_DURATION_MS = 2000
// An axis must move enough to identify its slope. Other axes can remain still.
const MIN_POSE_SPANS = [0.03, 0.03, 0.03, 0.01, 0.01, 0.03]
const TEMPORAL_BLOCKS = 4

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function bounds(poses: number[][]): RemoteHeadCorrection["poseBounds"] {
  return {
    min: MIN_POSE_SPANS.map((_, axis) =>
      Math.min(...poses.map((pose) => pose[axis]!))
    ),
    max: MIN_POSE_SPANS.map((_, axis) =>
      Math.max(...poses.map((pose) => pose[axis]!))
    ),
  }
}

/** Saturate outside measured motion, preserving a continuous finite gaze output. */
function correctionAtPose(model: RemoteHeadCorrection, pose: number[]): Point {
  const normalized = pose.map((value, axis) => {
    const margin =
      0.15 * (model.poseBounds.max[axis]! - model.poseBounds.min[axis]!)
    const low =
      Math.min(0, model.poseBounds.min[axis]! - model.reference[axis]!) - margin
    const high =
      Math.max(0, model.poseBounds.max[axis]! - model.reference[axis]!) + margin
    const delta = Math.min(high, Math.max(low, value - model.reference[axis]!))
    return delta / model.scale[axis]!
  })
  const correction = model.coefficients.map((row) =>
    row.reduce((sum, value, axis) => sum + value * normalized[axis]!, 0)
  ) as Point
  const magnitude = Math.hypot(...correction)
  if (magnitude > model.maxCorrection) {
    const factor = model.maxCorrection / magnitude
    return [correction[0] * factor, correction[1] * factor]
  }
  return correction
}

export function applyRemoteHeadCorrection(
  model: RemoteHeadCorrection,
  pose: HeadPose,
  point: Point
): Point | null {
  const correction = correctionAtPose(model, poseVector(pose))
  const corrected: Point = [point[0] + correction[0], point[1] + correction[1]]
  return corrected.every(Number.isFinite) ? corrected : null
}

function train(
  samples: HeadResidualSample[],
  reference: number[],
  observedAxes: number[],
  regularization: number
): RemoteHeadCorrection | null {
  const poseBounds = bounds(samples.map((sample) => sample.pose))
  const mean = MIN_POSE_SPANS.map(
    (_, axis) =>
      samples.reduce((sum, sample) => sum + sample.pose[axis]!, 0) /
      samples.length
  )
  const scale = MIN_POSE_SPANS.map((minimumSpan, axis) => {
    const variance =
      samples.reduce(
        (sum, sample) => sum + (sample.pose[axis]! - mean[axis]!) ** 2,
        0
      ) / samples.length
    return Math.max(Math.sqrt(variance), minimumSpan / 4)
  })
  if (
    observedAxes.some(
      (axis) =>
        poseBounds.max[axis]! - poseBounds.min[axis]! < MIN_POSE_SPANS[axis]!
    )
  ) {
    return null
  }
  const residualMean: Point = [0, 1].map(
    (axis) =>
      samples.reduce((sum, sample) => sum + sample.residual[axis]!, 0) /
      samples.length
  ) as Point
  // Center both variables to fit a nuisance intercept. Only the slopes are applied,
  // anchored at the frozen spatial pose, so this hold cannot shift the whole eye grid.
  const rows = samples.map((sample) =>
    observedAxes.map(
      (axis) => (sample.pose[axis]! - mean[axis]!) / scale[axis]!
    )
  )
  const targets: Point[] = samples.map((sample) => [
    sample.residual[0] - residualMean[0],
    sample.residual[1] - residualMean[1],
  ])
  const penalty = Math.sqrt(regularization * samples.length)
  for (let column = 0; column < observedAxes.length; column++) {
    rows.push(observedAxes.map((_, index) => (index === column ? penalty : 0)))
    targets.push([0, 0])
  }
  const fitted = fitScreenCoordinates(rows, targets)
  if (!fitted) {
    return null
  }
  const coefficients = fitted.map((row) =>
    MIN_POSE_SPANS.map((_, axis) => {
      const column = observedAxes.indexOf(axis)
      return column < 0 ? 0 : row[column]!
    })
  ) as [number[], number[]]
  const model: RemoteHeadCorrection = {
    reference: [...reference],
    scale,
    coefficients,
    observedAxes: [...observedAxes],
    poseSamples: samples.map((sample) => sample.pose),
    poseBounds,
    regularization,
    baselineRms: 0,
    correctedRms: 0,
    sampleCount: samples.length,
    durationMs: samples.at(-1)!.timestamp - samples[0]!.timestamp,
    maxCorrection: 0.25,
  }
  const magnitudes = samples
    .map((sample) => Math.hypot(...correctionAtPose(model, sample.pose)))
    .sort((left, right) => left - right)
  model.maxCorrection = Math.min(
    0.25,
    Math.max(
      0.01,
      magnitudes[Math.floor(0.95 * (magnitudes.length - 1))]! * 1.25
    )
  )
  return model
}

function squaredError(sample: HeadResidualSample, correction?: Point): number {
  return (
    (sample.residual[0] - (correction?.[0] ?? 0)) ** 2 +
    (sample.residual[1] - (correction?.[1] ?? 0)) ** 2
  )
}

/**
 * Learn residual drift during one known center fixation. Contiguous held-out
 * blocks test temporal generalization; they do not certify whole-screen accuracy.
 */
export function collectRemoteHeadHold(
  calibration: RemoteCalibration,
  input: CalibrationSample[]
): RemoteMotionHold | null {
  if (
    input.length < MIN_HEAD_CORRECTION_SAMPLES ||
    input.length > 4096 ||
    input.some(
      (sample) => sample.target[0] !== 0.5 || sample.target[1] !== 0.5
    ) ||
    !calibration.poseSamples.length
  ) {
    return null
  }
  const samples: CalibrationSample[] = []
  const timestamps = new Set<number>()
  for (const sample of input) {
    const timestamp = sample.observation.timestamp
    if (!Number.isFinite(timestamp) || timestamps.has(timestamp)) {
      continue
    }
    timestamps.add(timestamp)
    const point = predictRemoteGazeWithoutHeadCorrection(
      calibration,
      sample.observation
    )
    if (!point || sample.observation.source === "video") {
      continue
    }
    samples.push(sample)
  }
  if (
    samples.length < MIN_HEAD_CORRECTION_SAMPLES ||
    samples.length / input.length < 0.8 ||
    samples.at(-1)!.observation.timestamp - samples[0]!.observation.timestamp <
      MIN_DURATION_MS ||
    samples.some(
      (sample, index) =>
        index > 0 &&
        (sample.observation.timestamp <=
          samples[index - 1]!.observation.timestamp ||
          sample.observation.timestamp -
            samples[index - 1]!.observation.timestamp >
            500)
    )
  ) {
    return null
  }
  const poseBounds = bounds(
    samples.map((sample) => poseVector(sample.observation.pose!))
  )
  const observedAxes = MIN_POSE_SPANS.flatMap((minimumSpan, axis) =>
    poseBounds.max[axis]! - poseBounds.min[axis]! >= minimumSpan ? [axis] : []
  )
  if (!observedAxes.length) {
    return null
  }
  const previousAxes =
    calibration.motionFit?.observedAxes ??
    calibration.headCorrection?.observedAxes ??
    []
  if (previousAxes.some((axis) => !observedAxes.includes(axis))) {
    return null
  }
  return {
    samples,
    observedAxes,
    durationMs:
      samples.at(-1)!.observation.timestamp - samples[0]!.observation.timestamp,
  }
}

export function fitRemoteHeadCorrection(
  calibration: RemoteCalibration,
  input: CalibrationSample[]
): RemoteCalibration | null {
  const hold = collectRemoteHeadHold(calibration, input)
  if (!hold) {
    return null
  }
  const { observedAxes } = hold
  const previous = calibration.headCorrection
  const samples: HeadResidualSample[] = hold.samples.map((sample) => {
    const point = predictRemoteGazeWithoutHeadCorrection(
      calibration,
      sample.observation
    )!
    return {
      timestamp: sample.observation.timestamp,
      pose: poseVector(sample.observation.pose!),
      residual: [sample.target[0] - point[0], sample.target[1] - point[1]],
    }
  })
  const reference = MIN_POSE_SPANS.map((_, axis) =>
    median(calibration.poseSamples.map((pose) => pose[axis]!))
  )
  if (!reference.every(Number.isFinite)) {
    return null
  }
  const baselineRms = Math.sqrt(
    samples.reduce((sum, sample) => sum + squaredError(sample), 0) /
      samples.length
  )
  const activeBaselineRms = Math.sqrt(
    samples.reduce((sum, sample) => {
      const correction = previous
        ? correctionAtPose(previous, sample.pose)
        : undefined
      return sum + squaredError(sample, correction)
    }, 0) / samples.length
  )
  if (!Number.isFinite(activeBaselineRms) || activeBaselineRms < 0.01) {
    return null
  }
  let best: HeadCorrectionFitScore | null = null
  for (const regularization of [0.01, 0.1, 1, 10]) {
    let totalError = 0
    let supported = true
    for (let block = 0; block < TEMPORAL_BLOCKS; block++) {
      const start = Math.floor((block * samples.length) / TEMPORAL_BLOCKS)
      const end = Math.floor(((block + 1) * samples.length) / TEMPORAL_BLOCKS)
      const heldOut = samples.slice(start, end)
      const model = train(
        [...samples.slice(0, start), ...samples.slice(end)],
        reference,
        observedAxes,
        regularization
      )
      if (!model) {
        supported = false
        break
      }
      const baseline = heldOut.reduce(
        (sum, sample) =>
          sum +
          squaredError(
            sample,
            previous ? correctionAtPose(previous, sample.pose) : undefined
          ),
        0
      )
      const corrected = heldOut.reduce(
        (sum, sample) =>
          sum + squaredError(sample, correctionAtPose(model, sample.pose)),
        0
      )
      // A good aggregate cannot hide a harmful time block.
      if (
        Math.sqrt(corrected / heldOut.length) >
        Math.sqrt(baseline / heldOut.length) * 1.05 + 0.002
      ) {
        supported = false
        break
      }
      totalError += corrected
    }
    const correctedRms = Math.sqrt(totalError / samples.length)
    if (
      supported &&
      Number.isFinite(correctedRms) &&
      (!best || correctedRms < best.correctedRms)
    ) {
      best = { regularization, correctedRms }
    }
  }
  if (
    !best ||
    best.correctedRms > activeBaselineRms * 0.75 ||
    activeBaselineRms - best.correctedRms < 0.003
  ) {
    return null
  }
  const headCorrection = train(
    samples,
    reference,
    observedAxes,
    best.regularization
  )
  if (!headCorrection) {
    return null
  }
  headCorrection.baselineRms = baselineRms
  headCorrection.correctedRms = best.correctedRms
  return { ...calibration, headCorrection }
}
