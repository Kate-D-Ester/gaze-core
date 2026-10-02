import { applyGazeOffset } from "../eye-tracking/gaze-offset"
import type {
  CalibrationSample,
  HeadPose,
  RemoteCalibration,
  RemoteMode,
  RemoteObservation,
  Point,
  ValidationResult,
} from "./types"

export const CALIBRATION_TARGETS: Point[] = [
  [0.5, 0.5],
  [0.1, 0.1],
  [0.5, 0.1],
  [0.9, 0.1],
  [0.9, 0.5],
  [0.9, 0.9],
  [0.5, 0.9],
  [0.1, 0.9],
  [0.1, 0.5],
]
export const VALIDATION_TARGETS: Point[] = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.7, 0.7],
  [0.3, 0.7],
  [0.5, 0.6],
]
const MIN_QUALITY = 0.45

export function poseVector(pose: HeadPose): number[] {
  return [
    pose.yaw ?? 0,
    pose.pitch ?? 0,
    pose.roll ?? 0,
    pose.x,
    pose.y,
    Math.log(pose.scale),
  ]
}
function validObservation(
  observation: RemoteObservation,
  dimension?: number
): boolean {
  const { feature, pose } = observation
  return (
    !!feature &&
    feature.length > 0 &&
    (dimension === undefined || feature.length === dimension) &&
    feature.every(Number.isFinite) &&
    !!pose &&
    pose.scale > 0 &&
    poseVector(pose).every(Number.isFinite) &&
    observation.reason === null &&
    observation.quality >= MIN_QUALITY
  )
}
function targetKey(target: Point): string {
  return target.join(",")
}
function groupSamples(
  samples: CalibrationSample[]
): Map<string, CalibrationSample[]> {
  const groups = new Map<string, CalibrationSample[]>()
  for (const sample of samples) {
    const key = targetKey(sample.target)
    const group = groups.get(key) ?? []
    group.push(sample)
    groups.set(key, group)
  }
  return groups
}
/** Pivoted elimination on a small, regularized system. No inverse is formed. */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, i) => [...row, rhs[i]!])
  for (let col = 0; col < rhs.length; col++) {
    let pivot = col
    for (let row = col + 1; row < a.length; row++)
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null
    ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]
    const divisor = a[col]![col]!
    for (let j = col; j <= rhs.length; j++) a[col]![j] = a[col]![j]! / divisor
    for (let row = 0; row < a.length; row++) {
      if (row === col) continue
      const factor = a[row]![col]!
      for (let j = col; j <= rhs.length; j++)
        a[row]![j] = a[row]![j]! - factor * a[col]![j]!
    }
  }
  const result = a.map((row) => row[rhs.length]!)
  return result.every(Number.isFinite) ? result : null
}
function train(samples: CalibrationSample[], regularization: number) {
  const groups = groupSamples(samples)
  const dimension = samples[0]!.observation.feature!.length
  const weights = samples.map(
    (sample) => 1 / groups.get(targetKey(sample.target))!.length
  )
  const total = groups.size
  const mean = Array.from(
    { length: dimension },
    (_, j) =>
      samples.reduce(
        (sum, s, i) => sum + weights[i]! * s.observation.feature![j]!,
        0
      ) / total
  )
  const scale = mean.map((m, j) =>
    Math.sqrt(
      samples.reduce(
        (sum, s, i) =>
          sum + weights[i]! * (s.observation.feature![j]! - m) ** 2,
        0
      ) / total
    )
  )
  if (scale.every((s) => s < 1e-6)) return null
  const normalizedScale = scale.map((s) => Math.max(s, 0.001))
  const matrix = Array.from({ length: dimension + 1 }, () =>
    Array<number>(dimension + 1).fill(0)
  )
  const rhs = [
    Array<number>(dimension + 1).fill(0),
    Array<number>(dimension + 1).fill(0),
  ]
  for (const [i, sample] of samples.entries()) {
    const row = [
      1,
      ...sample.observation.feature!.map(
        (f, j) => (f - mean[j]!) / normalizedScale[j]!
      ),
    ]
    for (let a = 0; a < row.length; a++) {
      for (let b = 0; b < row.length; b++)
        matrix[a]![b] += weights[i]! * row[a]! * row[b]!
      for (let axis = 0; axis < 2; axis++)
        rhs[axis]![a] += weights[i]! * row[a]! * sample.target[axis]!
    }
  }
  for (let j = 1; j <= dimension; j++) matrix[j]![j] += regularization
  const x = solve(matrix, rhs[0]!)
  const y = solve(matrix, rhs[1]!)
  return x && y
    ? {
        featureMean: mean,
        featureScale: normalizedScale,
        coefficients: [x, y] as [number[], number[]],
      }
    : null
}
function project(
  model: Pick<
    RemoteCalibration,
    "featureMean" | "featureScale" | "coefficients"
  >,
  feature: number[]
): Point {
  const row = [
    1,
    ...feature.map(
      (f, j) => (f - model.featureMean[j]!) / model.featureScale[j]!
    ),
  ]
  return model.coefficients.map((coefficient) =>
    coefficient.reduce((sum, c, i) => sum + c * row[i]!, 0)
  ) as Point
}

export function fitRemoteCalibration(
  mode: RemoteMode,
  input: CalibrationSample[]
): RemoteCalibration | null {
  const dimension = input.find((s) => validObservation(s.observation))
    ?.observation.feature?.length
  if (!dimension || dimension > 64) return null
  const samples = input.filter(
    (s) =>
      validObservation(s.observation, dimension) &&
      s.target.every((t) => Number.isFinite(t) && t >= 0 && t <= 1)
  )
  const groups = groupSamples(samples)
  if (
    groups.size < 9 ||
    samples.length < 27 ||
    [...groups.values()].some((group) => group.length < 3)
  )
    return null
  const targets = [...groups.values()].map((group) => group[0]!.target)
  if (
    [0, 1].some(
      (axis) =>
        Math.max(...targets.map((t) => t[axis]!)) -
          Math.min(...targets.map((t) => t[axis]!)) <
        0.5
    )
  )
    return null
  if (
    samples.some(
      (s) => s.observation.pose!.kind !== samples[0]!.observation.pose!.kind
    )
  )
    return null
  let best = { regularization: 0, error: Infinity }
  // Whole target groups stay together: nearby frames and repeated pose passes must never leak into validation.
  for (const regularization of [0.001, 0.01, 0.1, 1, 10]) {
    let error = 0
    for (const [key, heldOut] of groups) {
      const model = train(
        samples.filter((s) => targetKey(s.target) !== key),
        regularization
      )
      if (!model) {
        error = Infinity
        break
      }
      error +=
        heldOut.reduce((sum, s) => {
          const point = project(model, s.observation.feature!)
          return (
            sum + Math.hypot(point[0] - s.target[0], point[1] - s.target[1])
          )
        }, 0) / heldOut.length
    }
    error /= groups.size
    if (error < best.error) best = { regularization, error }
  }
  if (!Number.isFinite(best.error) || best.error > 0.24) return null
  const model = train(samples, best.regularization)
  if (!model) return null
  const poses = samples.map((s) => poseVector(s.observation.pose!))
  return {
    ...model,
    mode,
    regularization: best.regularization,
    crossValidationError: best.error,
    poseKind: samples[0]!.observation.pose!.kind,
    poseSamples: poses,
    poseBounds: {
      min: poses[0]!.map((_, j) => Math.min(...poses.map((p) => p[j]!))),
      max: poses[0]!.map((_, j) => Math.max(...poses.map((p) => p[j]!))),
    },
    targetCount: groups.size,
    sampleCount: samples.length,
  }
}
export function poseSupported(
  calibration: RemoteCalibration,
  pose: HeadPose | null
): boolean {
  if (!pose || pose.kind !== calibration.poseKind || pose.scale <= 0)
    return false
  const margins = [0.15, 0.15, 0.15, 0.06, 0.06, Math.log(1.25)]
  const vector = poseVector(pose)
  if (
    !vector.every(
      (v, j) =>
        Number.isFinite(v) &&
        v >= calibration.poseBounds.min[j]! - margins[j]! &&
        v <= calibration.poseBounds.max[j]! + margins[j]!
    )
  )
    return false
  // A Cartesian box alone accepts unseen combinations (e.g. left translation + right yaw).
  return calibration.poseSamples.some(
    (sample) =>
      vector.reduce(
        (sum, v, j) => sum + ((v - sample[j]!) / margins[j]!) ** 2,
        0
      ) <= 2.25
  )
}
export function predictRemoteGaze(
  calibration: RemoteCalibration,
  observation: RemoteObservation
): Point | null {
  if (
    !validObservation(observation, calibration.featureMean.length) ||
    !poseSupported(calibration, observation.pose)
  )
    return null
  const point = project(calibration, observation.feature!)
  return point.every(Number.isFinite) ? point : null
}
export function evaluateRemoteValidation(
  calibration: RemoteCalibration,
  samples: CalibrationSample[],
  width: number,
  height: number,
  offset: Point = [0, 0]
): ValidationResult | null {
  if (width <= 0 || height <= 0) return null
  const groups = new Map<string, { point: Point; error: number }[]>()
  for (const sample of samples) {
    const point = applyGazeOffset(
      predictRemoteGaze(calibration, sample.observation),
      offset
    )
    if (!point) continue
    const pixels: Point = [point[0] * width, point[1] * height]
    const error = Math.hypot(
      (point[0] - sample.target[0]) * width,
      (point[1] - sample.target[1]) * height
    )
    const key = targetKey(sample.target)
    const group = groups.get(key) ?? []
    group.push({ point: pixels, error })
    groups.set(key, group)
  }
  if (!groups.size) return null
  const errors: number[] = []
  let mean = 0,
    squared = 0,
    jitter = 0
  for (const group of groups.values()) {
    const center: Point = [0, 0]
    for (const sample of group) {
      center[0] += sample.point[0] / group.length
      center[1] += sample.point[1] / group.length
      errors.push(sample.error)
    }
    mean += group.reduce((sum, s) => sum + s.error, 0) / group.length
    squared += group.reduce((sum, s) => sum + s.error ** 2, 0) / group.length
    jitter +=
      group.reduce(
        (sum, s) =>
          sum + (s.point[0] - center[0]) ** 2 + (s.point[1] - center[1]) ** 2,
        0
      ) / group.length
  }
  errors.sort((a, b) => a - b)
  return {
    meanPixels: mean / groups.size,
    rmsPixels: Math.sqrt(squared / groups.size),
    p95Pixels: errors[Math.max(0, Math.ceil(errors.length * 0.95) - 1)]!,
    jitterPixels: Math.sqrt(jitter / groups.size),
    targetCount: groups.size,
    sampleCount: errors.length,
  }
}
