import { alignGazePoint } from "../tracking-calibration/session-alignment"
import type { SessionAlignment } from "../tracking-calibration/session-alignment.types"
import { applyGazeOffset } from "../eye-tracking/gaze-offset"
import { evaluateValidation } from "../tracking-calibration/validation-metrics"
import { hasRgbBasePoint, predictBasePointCandidate } from "./base-point-input"
import { RGB_FEATURE_COUNT } from "./rgb-features"
import { applyRemoteHeadCorrection } from "./head-motion-calibration"
import {
  personalizedFeatures,
  personalizedFeatureVersion,
  isBinocularInput,
} from "./personalized-features"
import type {
  CalibrationSample,
  HeadPose,
  Point,
  RemoteCalibration,
  RemoteMode,
  RemoteObservation,
  RemotePoseSupport,
  RemotePoseSupportScope,
  PersonalizedInputKind,
  ValidationResult,
} from "./remote-eye-tracking.types"
import {
  SCREEN_CALIBRATION_TARGETS,
  SCREEN_ACCURACY_TARGETS,
} from "../tracking-calibration/screen-calibration"
export const CALIBRATION_TARGETS = SCREEN_CALIBRATION_TARGETS
export const VALIDATION_TARGETS = SCREEN_ACCURACY_TARGETS
const MIN_QUALITY = 0.45
// Normalized screen distance, used only for fitting support, never as verified accuracy.
export const MAX_SPATIAL_FIT_ERROR = 0.24
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
export function createRemotePoseSupport(
  samples: CalibrationSample[]
): RemotePoseSupport {
  const unique = new Map<string, number[]>()
  for (const sample of samples) {
    if (!sample.observation.pose) {
      continue
    }
    const pose = poseVector(sample.observation.pose)
    if (!pose.every(Number.isFinite)) {
      continue
    }
    unique.set(pose.map((value) => value.toFixed(4)).join(","), pose)
    if (unique.size >= 4096) {
      break
    }
  }
  const poses = [...unique.values()]
  if (!poses.length) {
    return {
      poseSamples: [],
      poseBounds: { min: Array(6).fill(0), max: Array(6).fill(0) },
    }
  }
  return {
    poseSamples: poses,
    poseBounds: {
      min: poses[0]!.map((_, axis) =>
        Math.min(...poses.map((pose) => pose[axis]!))
      ),
      max: poses[0]!.map((_, axis) =>
        Math.max(...poses.map((pose) => pose[axis]!))
      ),
    },
  }
}
export function validObservation(
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
export function remoteFeatureVersion(observation: RemoteObservation): string {
  return (
    observation.featureVersion ?? `legacy-${observation.feature?.length ?? 0}`
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

/** Reject a compact IR fit driven only by pose, or by a single ocular axis. */
function hasBinocularOcularCoverage(
  groups: Map<string, CalibrationSample[]>
): boolean {
  const ocularPoints: Point[] = []
  for (const group of groups.values()) {
    let x = 0
    let y = 0
    for (const sample of group) {
      const feature = sample.observation.feature!
      if (feature.length < 4) {
        return false
      }
      // Use eye-local offsets: rolling a constant offset must not invent eye-motion coverage.
      x += (feature[0]! + feature[2]!) / 2
      y += (feature[1]! + feature[3]!) / 2
    }
    ocularPoints.push([x / group.length, y / group.length])
  }
  // Units are fractions of canthus span. This is a degeneracy guard, not an accuracy score.
  const minimumOcularSpan = 0.005
  for (const axis of [0, 1]) {
    const values = ocularPoints.map((point) => point[axis]!)
    if (Math.max(...values) - Math.min(...values) < minimumOcularSpan) {
      return false
    }
  }
  const meanX =
    ocularPoints.reduce((sum, point) => sum + point[0], 0) / ocularPoints.length
  const meanY =
    ocularPoints.reduce((sum, point) => sum + point[1], 0) / ocularPoints.length
  let varianceX = 0
  let varianceY = 0
  let covariance = 0
  for (const [x, y] of ocularPoints) {
    const dx = x - meanX
    const dy = y - meanY
    varianceX += dx * dx
    varianceY += dy * dy
    covariance += dx * dy
  }
  const varianceProduct = varianceX * varianceY
  const normalizedDeterminant =
    (varianceProduct - covariance * covariance) / varianceProduct
  return Number.isFinite(normalizedDeterminant) && normalizedDeterminant > 0.01
}
/** Pivoted elimination on a small, regularized system. No inverse is formed. */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, i) => [...row, rhs[i]!])
  for (let col = 0; col < rhs.length; col++) {
    let pivot = col
    for (let row = col + 1; row < a.length; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) {
        pivot = row
      }
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) {
      return null
    }
    ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]
    const divisor = a[col]![col]!
    for (let j = col; j <= rhs.length; j++) {
      a[col]![j] = a[col]![j]! / divisor
    }
    for (let row = 0; row < a.length; row++) {
      if (row === col) {
        continue
      }
      const factor = a[row]![col]!
      for (let j = col; j <= rhs.length; j++) {
        a[row]![j] = a[row]![j]! - factor * a[col]![j]!
      }
    }
  }
  const result = a.map((row) => row[rhs.length]!)
  return result.every(Number.isFinite) ? result : null
}
export function trainRemoteMapping(
  samples: CalibrationSample[],
  regularization: number
) {
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
  if (scale.every((s) => s < 1e-6)) {
    return null
  }
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
      for (let b = 0; b < row.length; b++) {
        matrix[a]![b] += weights[i]! * row[a]! * row[b]!
      }
      for (let axis = 0; axis < 2; axis++) {
        rhs[axis]![a] += weights[i]! * row[a]! * sample.target[axis]!
      }
    }
  }
  for (let j = 1; j <= dimension; j++) {
    matrix[j]![j] += regularization
  }
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
export function projectRemoteMapping(
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
  if (!dimension || dimension > 64) {
    return null
  }
  const samples = input.filter(
    (s) =>
      validObservation(s.observation, dimension) &&
      s.target.every((t) => Number.isFinite(t) && t >= 0 && t <= 1)
  )
  const versionedRgb = samples.some(
    (sample) => sample.observation.baseModelVersion !== undefined
  )
  if (
    versionedRgb &&
    (mode === "ir" ||
      dimension !== RGB_FEATURE_COUNT ||
      samples.some((sample) => !hasRgbBasePoint(sample.observation)))
  ) {
    return null
  }
  if (
    new Set(samples.map((sample) => remoteFeatureVersion(sample.observation)))
      .size !== 1
  ) {
    return null
  }
  const groups = groupSamples(samples)
  if (
    groups.size < 9 ||
    samples.length < 27 ||
    [...groups.values()].some((group) => group.length < 3)
  ) {
    return null
  }
  if (
    ["ir-camera-axes-v1", "ir-camera-axes-v2"].includes(
      remoteFeatureVersion(samples[0]!.observation)
    ) &&
    !hasBinocularOcularCoverage(groups)
  ) {
    return null
  }
  const targets = [...groups.values()].map((group) => group[0]!.target)
  if (
    [0, 1].some(
      (axis) =>
        Math.max(...targets.map((t) => t[axis]!)) -
          Math.min(...targets.map((t) => t[axis]!)) <
        0.5
    )
  ) {
    return null
  }
  if (
    samples.some(
      (s) => s.observation.pose!.kind !== samples[0]!.observation.pose!.kind
    )
  ) {
    return null
  }
  let best = { regularization: 0, error: Infinity, squaredError: Infinity }
  // Whole target groups stay together: nearby frames and repeated pose passes must never leak into validation.
  for (const regularization of [0.001, 0.01, 0.1, 1, 10]) {
    let error = 0
    let squaredError = 0
    for (const [key, heldOut] of groups) {
      const model = trainRemoteMapping(
        samples.filter((s) => targetKey(s.target) !== key),
        regularization
      )
      if (!model) {
        error = Infinity
        break
      }
      for (const sample of heldOut) {
        const point = projectRemoteMapping(model, sample.observation.feature!)
        const distance = Math.hypot(
          point[0] - sample.target[0],
          point[1] - sample.target[1]
        )
        error += distance / heldOut.length
        squaredError += (distance * distance) / heldOut.length
      }
    }
    error /= groups.size
    if (error < best.error) {
      best = { regularization, error, squaredError: squaredError / groups.size }
    }
  }
  if (!Number.isFinite(best.error) || best.error > MAX_SPATIAL_FIT_ERROR) {
    return null
  }
  const model = trainRemoteMapping(samples, best.regularization)
  if (!model) {
    return null
  }
  return {
    ...model,
    mode,
    baseModelVersion: samples[0]!.observation.baseModelVersion,
    featureVersion: remoteFeatureVersion(samples[0]!.observation),
    regularization: best.regularization,
    // Both feature and neural candidates report target-balanced held-out frame RMS.
    crossValidationError: Math.sqrt(best.squaredError),
    poseKind: samples[0]!.observation.pose!.kind,
    ...createRemotePoseSupport(samples),
    targetCount: groups.size,
    sampleCount: samples.length,
  }
}

/** Transform a complete reading set, never improve a score by dropping difficult frames. */
export function fitPersonalizedCalibration(
  mode: RemoteMode,
  samples: CalibrationSample[],
  kind: PersonalizedInputKind
): RemoteCalibration | null {
  if (!isBinocularInput(kind) && mode === "ir") {
    return null
  }
  if (isBinocularInput(kind) && mode !== "ir") {
    return null
  }
  if (
    !samples.length ||
    samples.some(
      (sample) =>
        !validObservation(sample.observation) ||
        sample.observation.source === "video"
    )
  ) {
    return null
  }
  if (
    new Set(samples.map((sample) => remoteFeatureVersion(sample.observation)))
      .size !== 1
  ) {
    return null
  }
  if (
    !isBinocularInput(kind) &&
    samples.some((sample) => !hasRgbBasePoint(sample.observation))
  ) {
    return null
  }
  if (
    isBinocularInput(kind) &&
    !hasBinocularOcularCoverage(groupSamples(samples))
  ) {
    return null
  }
  const transformed: CalibrationSample[] = []
  for (const sample of samples) {
    const feature = personalizedFeatures(sample.observation, kind)
    if (!feature) {
      return null
    }
    transformed.push({
      ...sample,
      observation: {
        ...sample.observation,
        feature,
        baseModelVersion: undefined,
        featureVersion: personalizedFeatureVersion(kind),
      },
    })
  }
  const fitted = fitRemoteCalibration(mode, transformed)
  if (!fitted) {
    return null
  }
  return {
    ...fitted,
    inputKind: kind,
    representationVersion: personalizedFeatureVersion(kind),
    featureVersion: remoteFeatureVersion(samples[0]!.observation),
    baseModelVersion: samples[0]!.observation.baseModelVersion,
  }
}
/** Captured fitting support; this range alone is not an independent accuracy check. */
export function remotePoseBounds(
  calibration: RemoteCalibration
): RemotePoseSupport["poseBounds"] {
  return {
    min: calibration.poseBounds.min.map((value, axis) =>
      Math.min(
        value,
        calibration.headCorrection?.poseBounds.min[axis] ?? Infinity
      )
    ),
    max: calibration.poseBounds.max.map((value, axis) =>
      Math.max(
        value,
        calibration.headCorrection?.poseBounds.max[axis] ?? -Infinity
      )
    ),
  }
}
export function poseSupported(
  calibration: RemoteCalibration,
  pose: HeadPose | null,
  scope: RemotePoseSupportScope = "calibration"
): boolean {
  if (!pose || pose.kind !== calibration.poseKind || pose.scale <= 0) {
    return false
  }
  let margins = [0.15, 0.15, 0.15, 0.06, 0.06, Math.log(1.25)]
  if (scope === "validation" || calibration.inputKind === "base-point") {
    margins = [0.06, 0.06, 0.06, 0.025, 0.025, Math.log(1.08)]
  }
  const vector = poseVector(pose)
  const bounds = remotePoseBounds(calibration)
  const insideBounds = vector.every(
    (value, axis) =>
      Number.isFinite(value) &&
      value >= bounds.min[axis]! - margins[axis]! &&
      value <= bounds.max[axis]! + margins[axis]!
  )
  if (!insideBounds) {
    return false
  }
  // A Cartesian box alone accepts unseen combinations (e.g. left translation + right yaw).
  const supportSamples = [
    ...calibration.poseSamples,
    ...(calibration.headCorrection?.poseSamples ?? []),
  ]
  return supportSamples.some(
    (sample) =>
      vector.reduce(
        (sum, v, j) => sum + ((v - sample[j]!) / margins[j]!) ** 2,
        0
      ) <= 2.25
  )
}
/** Evaluate the frozen spatial mapping, including at new valid head poses. */
export function predictRemoteGazeWithoutHeadCorrection(
  calibration: RemoteCalibration,
  observation: RemoteObservation
): Point | null {
  if (
    (calibration.baseModelVersion !== undefined &&
      observation.baseModelVersion !== calibration.baseModelVersion) ||
    remoteFeatureVersion(observation) !==
      (calibration.featureVersion ??
        `legacy-${calibration.featureMean.length}`) ||
    !validObservation(
      observation,
      calibration.inputKind !== undefined
        ? undefined
        : calibration.featureMean.length
    ) ||
    observation.pose?.kind !== calibration.poseKind
  ) {
    return null
  }
  if (calibration.inputKind === "base-point") {
    return predictBasePointCandidate(calibration, observation)
  }
  let feature = observation.feature!
  if (calibration.inputKind) {
    if (
      calibration.representationVersion !==
      personalizedFeatureVersion(calibration.inputKind)
    ) {
      return null
    }
    const personalized = personalizedFeatures(
      observation,
      calibration.inputKind
    )
    if (
      !personalized ||
      personalized.length !== calibration.featureMean.length
    ) {
      return null
    }
    feature = personalized
  }
  const point = projectRemoteMapping(calibration, feature)
  return point.every(Number.isFinite) ? point : null
}
export function predictRemoteGaze(
  calibration: RemoteCalibration,
  observation: RemoteObservation
): Point | null {
  const point = predictRemoteGazeWithoutHeadCorrection(calibration, observation)
  if (!point || !calibration.headCorrection) {
    return point
  }
  return applyRemoteHeadCorrection(
    calibration.headCorrection,
    observation.pose!,
    point
  )
}
export function evaluateRemoteValidation(
  calibration: RemoteCalibration,
  samples: CalibrationSample[],
  width: number,
  height: number,
  offset: Point = [0, 0],
  alignment: SessionAlignment | null = null
): ValidationResult | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  const metrics = evaluateValidation(
    samples.map((sample) => ({
      timestamp: sample.observation.timestamp,
      targetId: sample.targetId,
      target: sample.target,
      point: applyGazeOffset(
        alignGazePoint(
          predictRemoteGaze(calibration, sample.observation),
          alignment
        ),
        offset
      ),
      reason: sample.observation.reason,
    })),
    { width, height }
  )
  if (
    metrics.rmsPixels === null ||
    metrics.meanPixels === null ||
    metrics.p95Pixels === null ||
    metrics.jitterPixels === null
  ) {
    return null
  }
  return {
    ...metrics,
    meanPixels: metrics.meanPixels,
    rmsPixels: metrics.rmsPixels,
    p95Pixels: metrics.p95Pixels,
    jitterPixels: metrics.jitterPixels,
  }
}
