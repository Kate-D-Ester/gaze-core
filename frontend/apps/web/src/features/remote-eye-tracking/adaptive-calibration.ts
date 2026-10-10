import {
  analyzeBasePointCalibration,
  PERSONAL_TARGETS,
} from "./base-point-calibration"
import type { BasePointFitResult } from "./base-point-calibration.types"
import { hasRgbBasePoint } from "./base-point-input"
import {
  fitRemoteCalibration,
  fitPersonalizedCalibration,
  remoteFeatureVersion,
  validObservation,
} from "./calibration"
import { fitRemoteHeadCorrection } from "./head-motion-calibration"
import {
  fitJointRemoteMotion,
  hasRemoteHeadCompensation,
} from "./joint-motion-calibration"
import { RGB_FEATURE_COUNT } from "./rgb-features"
import { RGB_BASE_MODEL_VERSION } from "./rgb-model-version"
import {
  improvesCalibration,
  preservesTargetQuality,
  scoreCalibrationCandidate,
} from "./calibration-comparison"
import type { CalibrationComparisonOptions } from "./calibration-comparison.types"
import type { AdaptiveCalibrationState } from "./adaptive-calibration.types"
import type { CaptureViewport } from "./calibration-overlay.types"
import type {
  CalibrationSample,
  PersonalizedInputKind,
  Point,
  RemoteCalibration,
  RemoteMode,
} from "./remote-eye-tracking.types"

export { PERSONAL_TARGETS } from "./base-point-calibration"
const HEAD_TARGET: Point[] = [[0.5, 0.5]]
export const HEAD_HOLD_DURATION_MS = 6000

export function createAdaptiveCalibration(
  mode: RemoteMode,
  headMovement: boolean
): AdaptiveCalibrationState {
  return {
    mode,
    headMovement,
    phase: "personal",
    training: [],
    setupTargets: PERSONAL_TARGETS,
    failure: null,
    candidate: null,
    result: null,
  }
}

/** Retry motion learning without recollecting the accepted gaze grid. */
export function createHeadCalibration(
  model: RemoteCalibration,
  samples: CalibrationSample[]
): AdaptiveCalibrationState {
  return {
    ...createAdaptiveCalibration(model.mode, true),
    phase: "head",
    training: samples,
    candidate: model,
  }
}

export function adaptiveCalibrationTargets(
  state: AdaptiveCalibrationState
): Point[] {
  if (state.failure) {
    return state.failure.targets
  }
  if (state.phase === "head") {
    return HEAD_TARGET
  }
  return state.setupTargets
}

export function retryAdaptiveCalibration(
  state: AdaptiveCalibrationState
): AdaptiveCalibrationState {
  if (state.phase !== "failed" || !state.failure) {
    return state
  }
  return {
    ...state,
    setupTargets: state.failure.targets,
    phase: "personal",
    failure: null,
  }
}

/** Recollect only a missing hold; never discard the other completed locations. */
function replaceRecapturedHolds(
  previous: CalibrationSample[],
  collected: CalibrationSample[]
): CalibrationSample[] {
  const targets = new Set(collected.map((sample) => sample.target.join(",")))
  const retained = previous.filter(
    (sample) => !targets.has(sample.target.join(","))
  )
  return [...retained, ...collected]
}

function fitFeatureCalibration(
  mode: RemoteMode,
  training: CalibrationSample[]
): BasePointFitResult {
  const usable = training.filter(
    (sample) =>
      validObservation(sample.observation) &&
      sample.observation.source !== "video"
  )
  const versions = new Set(
    usable.map((sample) => remoteFeatureVersion(sample.observation))
  )
  if (versions.size > 1) {
    return {
      model: null,
      issue: "incompatible-readings",
      retryTargets: PERSONAL_TARGETS,
    }
  }
  const missing = PERSONAL_TARGETS.filter((target) => {
    const readings = usable.filter(
      (sample) =>
        sample.target[0] === target[0] && sample.target[1] === target[1]
    )
    return readings.length < 18
  })
  if (missing.length > 0) {
    return { model: null, issue: "missing-readings", retryTargets: missing }
  }
  const model = fitRemoteCalibration(mode, usable)
  if (!model) {
    return {
      model: null,
      issue: "insufficient-response",
      retryTargets: PERSONAL_TARGETS,
    }
  }
  return { model, issue: null, retryTargets: [] }
}

/** Choose once from target-held-out evidence; live gaze never switches estimators. */
function fitExistingSpatialCalibration(
  mode: RemoteMode,
  training: CalibrationSample[]
): BasePointFitResult {
  const hasNetworkReadings = training.some((sample) =>
    Boolean(sample.observation.baseModelVersion)
  )
  if (mode === "ir" || !hasNetworkReadings) {
    return fitFeatureCalibration(mode, training)
  }
  const neuralFit = analyzeBasePointCalibration(mode, training)
  if (neuralFit.issue !== null && neuralFit.issue !== "insufficient-response") {
    return neuralFit
  }
  const readings = training.filter((sample) =>
    hasRgbBasePoint(sample.observation)
  )
  const hasBinocularFeatures =
    readings.length > 0 &&
    readings.every(
      (sample) => sample.observation.feature!.length === RGB_FEATURE_COUNT
    )
  if (!hasBinocularFeatures) {
    return neuralFit
  }
  const featureFit = fitFeatureCalibration(mode, readings)
  if (!featureFit.model) {
    return neuralFit
  }
  // This feature bank includes neural coordinates, even when measured irises dominate.
  const featureModel = {
    ...featureFit.model,
    baseModelVersion: RGB_BASE_MODEL_VERSION,
  }
  const rgbFeatureFit = { ...featureFit, model: featureModel }
  if (!neuralFit.model) {
    return rgbFeatureFit
  }
  // Require a meaningful improvement rather than switching on tiny fitting differences.
  const improvementRatio = 0.8
  if (
    featureModel.crossValidationError <
    neuralFit.model.crossValidationError * improvementRatio
  ) {
    return rgbFeatureFit
  }
  return neuralFit
}

function fitSpatialCalibration(
  mode: RemoteMode,
  training: CalibrationSample[]
): BasePointFitResult {
  const existing = fitExistingSpatialCalibration(mode, training)
  if (existing.issue && existing.issue !== "insufficient-response") {
    return existing
  }
  const samples = training.filter(
    (sample) =>
      validObservation(sample.observation) &&
      sample.observation.source !== "video"
  )
  const kinds: PersonalizedInputKind[] =
    mode === "ir"
      ? ["binocular", "binocular-camera"]
      : ["appearance", "appearance-refined"]
  let best = existing
  for (const kind of kinds) {
    const candidate = fitPersonalizedCalibration(mode, samples, kind)
    if (!candidate) {
      continue
    }
    // A refined model needs a usable baseline to qualify its low-visibility behavior.
    if (kind === "appearance-refined" && !best.model) {
      continue
    }
    if (best.model) {
      if (
        candidate.crossValidationError >=
        best.model.crossValidationError * 0.8
      ) {
        continue
      }
      const baselineScore = scoreCalibrationCandidate(best.model, samples)
      const candidateScore = scoreCalibrationCandidate(candidate, samples)
      if (
        !baselineScore ||
        !candidateScore ||
        !improvesCalibration(candidateScore, baselineScore)
      ) {
        continue
      }
      if (kind === "appearance-refined") {
        const cases: CalibrationComparisonOptions[] = [
          { landmarkFallbackEyes: [0] },
          { landmarkFallbackEyes: [1] },
          { landmarkFallbackEyes: [0, 1] },
        ]
        const reliableFallback = cases.every((options) => {
          const score = scoreCalibrationCandidate(candidate, samples, options)
          return score !== null && preservesTargetQuality(score, baselineScore)
        })
        if (!reliableFallback) {
          continue
        }
      }
    }
    best = { model: candidate, issue: null, retryTargets: [] }
  }
  return best
}

function complete(
  state: AdaptiveCalibrationState,
  model: RemoteCalibration,
  viewport: CaptureViewport,
  headSamples: CalibrationSample[] = [],
  headCorrectionUpdated = false
): AdaptiveCalibrationState {
  return {
    ...state,
    phase: "complete",
    failure: null,
    result: {
      model,
      samples: state.training,
      headSamples,
      viewport,
      headMovementLearned: hasRemoteHeadCompensation(model),
      headCorrectionUpdated,
      accuracyVerified: false,
      validation: null,
    },
  }
}

/** Fit once, optionally learn motion bias, then offer an independent accuracy check. */
export function finishAdaptiveCapture(
  state: AdaptiveCalibrationState,
  collected: CalibrationSample[],
  viewport: CaptureViewport,
  attempts = collected
): AdaptiveCalibrationState {
  if (state.phase === "complete" || state.phase === "failed") {
    return state
  }
  if (state.phase === "personal") {
    const training = replaceRecapturedHolds(state.training, collected)
    const fit = fitSpatialCalibration(state.mode, training)
    const next = { ...state, training, candidate: fit.model }
    if (!fit.model) {
      return {
        ...next,
        phase: "failed",
        failure: { fitIssue: fit.issue, targets: fit.retryTargets },
      }
    }
    if (state.headMovement) {
      return { ...next, phase: "head" }
    }
    return complete(next, fit.model, viewport)
  }
  if (!state.candidate) {
    return state
  }
  let corrected = fitJointRemoteMotion(
    state.candidate,
    state.training,
    attempts
  )
  if (!corrected && !state.candidate.motionFit) {
    corrected = fitRemoteHeadCorrection(state.candidate, attempts)
  }
  // A missing/unhelpful motion hold cannot erase a completed spatial calibration.
  return complete(
    state,
    corrected ?? state.candidate,
    viewport,
    attempts.slice(),
    corrected !== null
  )
}
