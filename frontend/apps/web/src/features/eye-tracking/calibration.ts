import {
  applyAffineMapping,
  fitAffineMapping,
  mappingValidationError,
} from "./calibration-mapping"
import {
  applyQuadraticMapping,
  selectQuadraticMapping,
} from "./calibration-polynomial"
import { DEFAULT_GAZE_ORIENTATION } from "./calibration-orientation"
import type { GazeOrientation } from "./calibration.types"
import type {
  Calibration,
  CalibrationSample,
  Point,
  Vector3,
} from "./eye-tracking.types"
import { finite } from "./geometry"
import {
  fitHeadCompensation,
  mapHeadCompensatedGaze,
} from "./head-tracking/head-calibration"
import type { HeadPose } from "./head-tracking/head-pose.types"
export const CALIBRATION_TARGETS: Point[] = [
  [0.5, 0.5],
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.1, 0.9],
  [0.5, 0.1],
  [0.9, 0.5],
  [0.5, 0.9],
  [0.1, 0.5],
]
export const VALIDATION_TARGETS: Point[] = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.7, 0.7],
  [0.3, 0.7],
  [0.5, 0.6],
]
export function gazeFeature(direction: Vector3): Point | null {
  return finite(direction) && direction[2] < -0.1
    ? [direction[0] / -direction[2], direction[1] / -direction[2]]
    : null
}
export function mapGaze(
  calibration: Calibration,
  feature: Point,
  headPose?: HeadPose | null
): Point | null {
  if (!finite(feature)) {
    return null
  }
  if (calibration.headCompensation) {
    if (!headPose) {
      return null
    }
    return mapHeadCompensatedGaze(
      calibration.headCompensation,
      feature,
      headPose
    )
  }
  if (calibration.quadraticMapping) {
    return applyQuadraticMapping(
      calibration.quadraticMapping,
      calibration.coefficients,
      feature
    )
  }
  return applyAffineMapping(calibration.coefficients, feature)
}
function fitMapping(
  samples: CalibrationSample[],
  orientation: GazeOrientation,
  validate: boolean,
  screenAspectRatio: number
): Calibration | null {
  if (samples.some((sample) => sample.headPose)) {
    const headCompensation = fitHeadCompensation(
      samples,
      orientation,
      validate,
      screenAspectRatio
    )
    if (!headCompensation) {
      return null
    }
    return {
      coefficients: headCompensation.coefficients,
      headCompensation,
      validationError: headCompensation.validationError,
    }
  }
  const coefficients = fitAffineMapping(samples)
  if (!coefficients) {
    return null
  }
  let validationError = 0
  if (validate) {
    const error = mappingValidationError(samples)
    if (error === null) {
      return null
    }
    validationError = error
    const nonlinear = selectQuadraticMapping(samples, coefficients, error)
    if (nonlinear) {
      return {
        coefficients,
        quadraticMapping: nonlinear.mapping,
        validationError: nonlinear.validationError,
      }
    }
  }
  return { coefficients, validationError }
}
export function fitCalibration(
  samples: CalibrationSample[],
  orientation: GazeOrientation = DEFAULT_GAZE_ORIENTATION,
  screenAspectRatio = 1.6
): Calibration | null {
  if (new Set(samples.map((sample) => sample.target.join(","))).size < 9) {
    return null
  }
  return fitMapping(samples, orientation, true, screenAspectRatio)
}
export function fitInitialCalibration(
  samples: CalibrationSample[],
  orientation: GazeOrientation = DEFAULT_GAZE_ORIENTATION
): Calibration | null {
  // Bootstrap directional guidance at the neutral pose; this is never a head compensation model.
  return fitMapping(
    samples.map((sample) => ({
      feature: sample.feature,
      target: sample.target,
    })),
    orientation,
    false,
    1.6
  )
}
/** Validation uses the same paired ray/pose projections as calibration collection. */
export function mapCalibrationSample(
  calibration: Calibration,
  sample: CalibrationSample
): Point | null {
  if (!calibration.headCompensation || !sample.headMeasurements) {
    return mapGaze(calibration, sample.feature, sample.headPose)
  }
  if (sample.headMeasurements.length === 0) {
    return null
  }
  const mean: Point = [0, 0]
  for (const measurement of sample.headMeasurements) {
    const point = mapGaze(calibration, measurement.feature, measurement.pose)
    if (!point) {
      return null
    }
    mean[0] += point[0] / sample.headMeasurements.length
    mean[1] += point[1] / sample.headMeasurements.length
  }
  return mean
}
