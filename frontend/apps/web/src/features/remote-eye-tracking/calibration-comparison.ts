import { fixationCenter } from "./base-point-calibration"
import {
  fitSpatialMapping,
  predictBasePointSpatial,
} from "./base-point-spatial"
import { trainRemoteMapping, projectRemoteMapping } from "./calibration"
import { personalizedFeatures } from "./personalized-features"
import type {
  CalibrationComparisonOptions,
  CalibrationComparisonScore,
} from "./calibration-comparison.types"
import type {
  CalibrationSample,
  Point,
  RemoteCalibration,
  RemoteObservation,
} from "./remote-eye-tracking.types"

function fallbackObservation(
  observation: RemoteObservation,
  eyes: CalibrationComparisonOptions["landmarkFallbackEyes"]
): RemoteObservation {
  if (!eyes || !observation.irisRefinement || !observation.feature) {
    return observation
  }
  const offsets = [...observation.irisRefinement.offsets] as [
    number,
    number,
    number,
    number,
  ]
  for (const eye of eyes) {
    offsets[eye * 2] = observation.feature[2 + eye * 2]!
    offsets[eye * 2 + 1] = observation.feature[3 + eye * 2]!
  }
  return {
    ...observation,
    irisRefinement: { ...observation.irisRefinement, offsets },
  }
}

/** Refit frozen hyperparameters with a complete target withheld; normalization uses training only. */
export function scoreCalibrationCandidate(
  model: RemoteCalibration,
  samples: CalibrationSample[],
  options: CalibrationComparisonOptions = {}
): CalibrationComparisonScore | null {
  const groups = new Map<string, CalibrationSample[]>()
  for (const sample of samples) {
    const key = sample.target.join(",")
    const group = groups.get(key) ?? []
    group.push(sample)
    groups.set(key, group)
  }
  const targets: CalibrationComparisonScore["targets"] = []
  for (const [key, heldOut] of groups) {
    const trainingGroups = [...groups]
      .filter(([target]) => target !== key)
      .map(([, group]) => group)
    let predictions: (Point | null)[]
    let states = 1
    if (model.inputKind === "base-point") {
      const fitted = fitSpatialMapping(
        trainingGroups.map(fixationCenter),
        trainingGroups.map((group) => group[0]!.target),
        model.spatialBasis ?? "affine",
        model.regularization
      )
      if (!fitted) {
        return null
      }
      predictions = heldOut.map((sample) =>
        predictBasePointSpatial(fitted, sample.observation.basePoint!)
      )
    } else {
      const inputKind = model.inputKind
      const transformed = trainingGroups.flat().map((sample) => ({
        ...sample,
        observation: {
          ...sample.observation,
          feature: inputKind
            ? personalizedFeatures(sample.observation, inputKind)
            : sample.observation.feature,
        },
      }))
      if (transformed.some((sample) => !sample.observation.feature)) {
        return null
      }
      const fitted = trainRemoteMapping(transformed, model.regularization)
      if (!fitted) {
        return null
      }
      const predict = (observation: RemoteObservation): Point | null => {
        const feature = inputKind
          ? personalizedFeatures(observation, inputKind)
          : observation.feature
        return feature ? projectRemoteMapping(fitted, feature) : null
      }
      if (options.landmarkFallbackEyes?.length) {
        states = 2
      }
      predictions = heldOut.flatMap((sample) => {
        const original = predict(sample.observation)
        if (states === 1) {
          return [original]
        }
        const fallback = fallbackObservation(
          sample.observation,
          options.landmarkFallbackEyes
        )
        return [original, predict(fallback)]
      })
    }
    if (predictions.some((point) => !point || !point.every(Number.isFinite))) {
      return null
    }
    const points = predictions as Point[]
    const center: Point = [0, 0]
    for (const point of points) {
      center[0] += point[0] / points.length
      center[1] += point[1] / points.length
    }
    const target = heldOut[0]!.target
    const errors = Array<number>(states).fill(0)
    for (const [index, point] of points.entries()) {
      errors[index % states]! +=
        (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2
    }
    // Keep the worse state's error, but measure jitter across BOTH states.
    // Otherwise two steady estimates at different positions hide dropout jumps.
    const rms = Math.sqrt(Math.max(...errors) / heldOut.length)
    const jitter = Math.sqrt(
      points.reduce(
        (sum, point) =>
          sum + (point[0] - center[0]) ** 2 + (point[1] - center[1]) ** 2,
        0
      ) / points.length
    )
    targets.push({ key, rms, jitter })
  }
  if (!targets.length) {
    return null
  }
  return {
    rms: Math.sqrt(
      targets.reduce((sum, target) => sum + target.rms ** 2, 0) / targets.length
    ),
    targets,
  }
}

/** Product guardrails, not published accuracy thresholds: no average can hide a harmed corner. */
export function improvesCalibration(
  candidate: CalibrationComparisonScore,
  baseline: CalibrationComparisonScore
): boolean {
  if (
    !Number.isFinite(candidate.rms) ||
    candidate.rms >= baseline.rms * 0.8 ||
    !preservesTargetQuality(candidate, baseline)
  ) {
    return false
  }
  return true
}

export function preservesTargetQuality(
  candidate: CalibrationComparisonScore,
  baseline: CalibrationComparisonScore
): boolean {
  if (
    !Number.isFinite(candidate.rms) ||
    candidate.targets.length !== baseline.targets.length
  ) {
    return false
  }
  return baseline.targets.every((target) => {
    const comparison = candidate.targets.find(
      (other) => other.key === target.key
    )
    return (
      comparison !== undefined &&
      comparison.rms <= target.rms * 1.15 + 0.01 &&
      comparison.jitter <= target.jitter * 1.1 + 0.005
    )
  })
}
