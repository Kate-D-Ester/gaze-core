import {
  hasOnlyKeys,
  isFiniteNumber,
  isMatrix,
  isRecord,
  isVector,
} from "../tracking-calibration/runtime-validation"
import type { RemoteCalibration } from "./remote-eye-tracking.types"
import { RGB_BASE_MODEL_VERSION } from "./rgb-model-version"
import { RGB_FEATURE_COUNT } from "./rgb-features"
import {
  personalizedFeatureCount,
  personalizedFeatureVersion,
  isBinocularInput,
} from "./personalized-features"

function isPoseSupport(value: Record<string, unknown>): boolean {
  if (
    !Array.isArray(value.poseSamples) ||
    value.poseSamples.length < 1 ||
    value.poseSamples.length > 4096 ||
    !value.poseSamples.every((pose) => isVector(pose, 6)) ||
    !isRecord(value.poseBounds) ||
    !hasOnlyKeys(value.poseBounds, ["min", "max"]) ||
    !isVector(value.poseBounds.min, 6) ||
    !isVector(value.poseBounds.max, 6)
  ) {
    return false
  }
  const minimum = value.poseBounds.min
  const maximum = value.poseBounds.max
  return (
    minimum.every((min, axis) => min <= maximum[axis]!) &&
    value.poseSamples.every((pose) =>
      (pose as number[]).every(
        (value, axis) => value >= minimum[axis]! && value <= maximum[axis]!
      )
    )
  )
}

function isHeadCorrection(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "reference",
      "scale",
      "coefficients",
      "observedAxes",
      "poseSamples",
      "poseBounds",
      "regularization",
      "baselineRms",
      "correctedRms",
      "sampleCount",
      "durationMs",
      "maxCorrection",
    ]) ||
    !isVector(value.reference, 6) ||
    !isVector(value.scale, 6) ||
    !value.scale.every((scale) => scale > 0) ||
    !isMatrix(value.coefficients, 2, 6) ||
    !Array.isArray(value.observedAxes) ||
    value.observedAxes.length < 1 ||
    value.observedAxes.length > 6 ||
    !value.observedAxes.every(
      (axis) => Number.isInteger(axis) && axis >= 0 && axis < 6
    ) ||
    new Set(value.observedAxes).size !== value.observedAxes.length ||
    !isPoseSupport(value)
  ) {
    return false
  }
  const axes = value.observedAxes
  if (
    !value.coefficients.every((row) =>
      row.every((coefficient, axis) => axes.includes(axis) || coefficient === 0)
    )
  ) {
    return false
  }
  if (
    ![
      value.regularization,
      value.baselineRms,
      value.correctedRms,
      value.sampleCount,
      value.durationMs,
      value.maxCorrection,
    ].every((metric) => isFiniteNumber(metric) && metric >= 0)
  ) {
    return false
  }
  return (
    (value.regularization as number) > 0 &&
    (value.baselineRms as number) >= 0.01 &&
    (value.correctedRms as number) <= (value.baselineRms as number) * 0.75 &&
    Number.isInteger(value.sampleCount) &&
    (value.sampleCount as number) >= 48 &&
    value.sampleCount === (value.poseSamples as number[][]).length &&
    (value.durationMs as number) >= 2000 &&
    (value.maxCorrection as number) > 0 &&
    (value.maxCorrection as number) <= 0.25
  )
}

function isMotionFit(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "version",
      "baselineMotionRms",
      "motionRms",
      "spatialRms",
      "observedAxes",
      "sampleCount",
      "durationMs",
    ]) ||
    value.version !== "joint-motion-v1" ||
    !Array.isArray(value.observedAxes) ||
    value.observedAxes.length < 1 ||
    value.observedAxes.length > 6 ||
    !value.observedAxes.every(
      (axis) => Number.isInteger(axis) && axis >= 0 && axis < 6
    ) ||
    new Set(value.observedAxes).size !== value.observedAxes.length ||
    ![
      value.baselineMotionRms,
      value.motionRms,
      value.spatialRms,
      value.sampleCount,
      value.durationMs,
    ].every((metric) => isFiniteNumber(metric) && metric >= 0)
  ) {
    return false
  }
  return (
    (value.baselineMotionRms as number) - (value.motionRms as number) >=
      0.003 &&
    (value.motionRms as number) <= (value.baselineMotionRms as number) * 0.75 &&
    (value.motionRms as number) <= 0.24 &&
    (value.spatialRms as number) <= 0.24 &&
    Number.isInteger(value.sampleCount) &&
    (value.sampleCount as number) >= 48 &&
    (value.sampleCount as number) <= 4096 &&
    (value.durationMs as number) >= 2000
  )
}

export function isRemoteCalibration(
  value: unknown
): value is RemoteCalibration {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "mode",
      "inputKind",
      "representationVersion",
      "spatialBasis",
      "headCorrection",
      "motionFit",
      "baseModelVersion",
      "featureVersion",
      "featureMean",
      "featureScale",
      "coefficients",
      "regularization",
      "crossValidationError",
      "poseKind",
      "poseSamples",
      "poseBounds",
      "targetCount",
      "sampleCount",
    ])
  ) {
    return false
  }
  if (
    !Array.isArray(value.featureMean) ||
    value.featureMean.length < 1 ||
    value.featureMean.length > 64
  ) {
    return false
  }
  const dimension = value.featureMean.length
  let coefficientCount = dimension + 1
  if (
    value.inputKind === "appearance" ||
    value.inputKind === "appearance-refined" ||
    value.inputKind === "binocular" ||
    value.inputKind === "binocular-camera"
  ) {
    if (
      value.poseKind !== "face" ||
      value.representationVersion !==
        personalizedFeatureVersion(value.inputKind) ||
      dimension !== personalizedFeatureCount(value.inputKind) ||
      value.spatialBasis !== undefined
    ) {
      return false
    }
    if (!isBinocularInput(value.inputKind)) {
      if (
        value.mode === "ir" ||
        value.baseModelVersion !== RGB_BASE_MODEL_VERSION
      ) {
        return false
      }
    } else if (value.mode !== "ir" || value.baseModelVersion !== undefined) {
      return false
    }
  } else if (value.inputKind !== undefined) {
    if (
      value.inputKind !== "base-point" ||
      value.baseModelVersion !== RGB_BASE_MODEL_VERSION ||
      value.mode === "ir" ||
      value.poseKind !== "face" ||
      dimension !== 2 ||
      (value.spatialBasis !== undefined &&
        value.spatialBasis !== "affine" &&
        value.spatialBasis !== "quadratic")
    ) {
      return false
    }
    coefficientCount = value.spatialBasis === "quadratic" ? 6 : 3
  } else {
    if (value.spatialBasis !== undefined) {
      return false
    }
    if (
      value.baseModelVersion !== undefined &&
      (value.baseModelVersion !== RGB_BASE_MODEL_VERSION ||
        value.mode === "ir" ||
        value.poseKind !== "face" ||
        dimension !== RGB_FEATURE_COUNT)
    ) {
      return false
    }
  }
  if (
    value.inputKind !== "appearance" &&
    value.inputKind !== "appearance-refined" &&
    value.inputKind !== "binocular" &&
    value.inputKind !== "binocular-camera" &&
    value.representationVersion !== undefined
  ) {
    return false
  }
  if (
    !isVector(value.featureMean, dimension) ||
    !isVector(value.featureScale, dimension) ||
    !value.featureScale.every((scale) => scale > 0) ||
    !isMatrix(value.coefficients, 2, coefficientCount) ||
    (value.headCorrection !== undefined &&
      !isHeadCorrection(value.headCorrection)) ||
    (value.motionFit !== undefined &&
      (!isMotionFit(value.motionFit) ||
        value.headCorrection !== undefined ||
        value.inputKind === "base-point"))
  ) {
    return false
  }
  if (
    value.featureVersion !== undefined &&
    (typeof value.featureVersion !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(value.featureVersion))
  ) {
    return false
  }
  if (
    !["mobile", "webcam", "ir"].includes(String(value.mode)) ||
    !["face", "eye-reference"].includes(String(value.poseKind)) ||
    !isPoseSupport(value)
  ) {
    return false
  }
  return [
    value.regularization,
    value.crossValidationError,
    value.targetCount,
    value.sampleCount,
  ].every((metric) => isFiniteNumber(metric) && metric >= 0)
}
