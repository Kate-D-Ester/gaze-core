import {
  fitBasePointSpatial,
  predictBasePointSpatial,
} from "./base-point-spatial"
import { hasRgbBasePoint } from "./base-point-input"
import {
  CALIBRATION_TARGETS,
  createRemotePoseSupport,
  MAX_SPATIAL_FIT_ERROR,
  remoteFeatureVersion,
} from "./calibration"
import type {
  BasePointFitIssue,
  BasePointFitResult,
} from "./base-point-calibration.types"
import { RGB_BASE_MODEL_VERSION } from "./rgb-model-version"
import type {
  CalibrationSample,
  Point,
  RemoteCalibration,
  RemoteMode,
} from "./remote-eye-tracking.types"

/** A median fixation center resists isolated detections without hiding live-frame jitter. */
export function fixationCenter(group: CalibrationSample[]): Point {
  const center: Point = [0, 0]
  for (const axis of [0, 1]) {
    const values = group.map((sample) => sample.observation.basePoint![axis]!)
    values.sort((left, right) => left - right)
    const middle = Math.floor(values.length / 2)
    center[axis] = values[middle]!
    if (values.length % 2 === 0) {
      center[axis] = (values[middle - 1]! + values[middle]!) / 2
    }
  }
  return center
}

export const PERSONAL_TARGETS: Point[] = CALIBRATION_TARGETS

function failedFit(
  issue: BasePointFitIssue,
  retryTargets = PERSONAL_TARGETS
): BasePointFitResult {
  return { model: null, issue, retryTargets }
}

/** Personalize the existing RGB estimate; keep failure reasons separate from accuracy. */
export function analyzeBasePointCalibration(
  mode: RemoteMode,
  input: CalibrationSample[]
): BasePointFitResult {
  if (mode === "ir") {
    return failedFit("incompatible-readings")
  }
  const samples = input.filter(
    (sample) =>
      hasRgbBasePoint(sample.observation) &&
      PERSONAL_TARGETS.some(
        (target) =>
          target[0] === sample.target[0] && target[1] === sample.target[1]
      )
  )
  const versions = new Set(
    samples.map((sample) => remoteFeatureVersion(sample.observation))
  )
  if (versions.size > 1) {
    return failedFit("incompatible-readings")
  }
  const groups = PERSONAL_TARGETS.map((target) =>
    samples.filter(
      (sample) =>
        sample.target[0] === target[0] && sample.target[1] === target[1]
    )
  )
  const missingTargets = PERSONAL_TARGETS.filter(
    (_, index) => groups[index]!.length < 18
  )
  if (missingTargets.length > 0) {
    return failedFit("missing-readings", missingTargets)
  }
  const points = groups.map(fixationCenter)
  const frameGroups = groups.map((group) =>
    group.map((sample) => sample.observation.basePoint!)
  )
  const fitted = fitBasePointSpatial(points, PERSONAL_TARGETS, frameGroups)
  if (!fitted) {
    return failedFit("insufficient-response")
  }
  let squaredError = 0
  let centerSquaredError = 0
  for (const [index, group] of groups.entries()) {
    const center = predictBasePointSpatial(
      fitted.heldOutModels[index]!,
      points[index]!
    )
    if (!center) {
      return failedFit("insufficient-response")
    }
    const target = PERSONAL_TARGETS[index]!
    centerSquaredError +=
      (center[0] - target[0]) ** 2 + (center[1] - target[1]) ** 2
    let groupError = 0
    for (const sample of group) {
      const point = predictBasePointSpatial(
        fitted.heldOutModels[index]!,
        sample.observation.basePoint!
      )
      if (!point) {
        return failedFit("insufficient-response")
      }
      groupError +=
        (point[0] - sample.target[0]) ** 2 + (point[1] - sample.target[1]) ** 2
    }
    squaredError += groupError / group.length
  }
  // Raw held-out training frames remain diagnostic; this is not independent accuracy evidence.
  const crossValidationError = Math.sqrt(squaredError / groups.length)
  const centerRms = Math.sqrt(centerSquaredError / groups.length)
  // A finite fit can still ignore gaze and map every location near the center.
  // Check robust held-out fixation centers; isolated raw-frame spikes remain diagnostic.
  if (
    !Number.isFinite(crossValidationError) ||
    !Number.isFinite(centerRms) ||
    centerRms > MAX_SPATIAL_FIT_ERROR
  ) {
    return failedFit("insufficient-response")
  }
  return {
    issue: null,
    retryTargets: [],
    model: {
      mode,
      inputKind: "base-point",
      baseModelVersion: RGB_BASE_MODEL_VERSION,
      featureVersion: remoteFeatureVersion(samples[0]!.observation),
      ...fitted.model,
      regularization: fitted.regularization,
      crossValidationError,
      poseKind: "face",
      ...createRemotePoseSupport(samples),
      targetCount: groups.length,
      sampleCount: samples.length,
    },
  }
}

export function fitBasePointCalibration(
  mode: RemoteMode,
  input: CalibrationSample[]
): RemoteCalibration | null {
  return analyzeBasePointCalibration(mode, input).model
}
