import { fitScreenCoordinates } from "../eye-tracking/calibration-least-squares"
import type {
  BasePointSpatialFit,
  BasePointSpatialModel,
  SpatialBasis,
  SpatialCandidate,
} from "./base-point-spatial.types"
import type { Point } from "./remote-eye-tracking.types"

function spatialFeatures(
  point: Point,
  model: BasePointSpatialModel
): number[] | null {
  if (
    model.featureMean.length !== 2 ||
    model.featureScale.length !== 2 ||
    !model.featureMean.every(Number.isFinite) ||
    !model.featureScale.every((value) => Number.isFinite(value) && value > 0)
  ) {
    return null
  }
  const x = (point[0] - model.featureMean[0]!) / model.featureScale[0]!
  const y = (point[1] - model.featureMean[1]!) / model.featureScale[1]!
  const features = [1, x, y]
  if (model.spatialBasis === "quadratic") {
    features.push(x * x, x * y, y * y)
  }
  if (!features.every(Number.isFinite)) {
    return null
  }
  return features
}

/** Stored normalization also applies during prediction, including legacy identity normalization. */
export function predictBasePointSpatial(
  model: BasePointSpatialModel,
  point: Point
): Point | null {
  const features = spatialFeatures(point, model)
  if (!features) {
    return null
  }
  const prediction: Point = [0, 0]
  for (let axis = 0; axis < 2; axis++) {
    const coefficients = model.coefficients[axis]!
    if (coefficients.length !== features.length) {
      return null
    }
    prediction[axis] = coefficients.reduce(
      (sum, value, column) => sum + value * features[column]!,
      0
    )
  }
  if (!prediction.every(Number.isFinite)) {
    return null
  }
  return prediction
}

/** Ridge penalizes curvature only; an affine rank check prevents fabricated gaze response. */
export function fitSpatialMapping(
  points: Point[],
  targets: Point[],
  spatialBasis: SpatialBasis,
  regularization: number
): BasePointSpatialModel | null {
  if (points.length < 4 || points.length !== targets.length) {
    return null
  }
  if ([...points, ...targets].some((point) => !point.every(Number.isFinite))) {
    return null
  }
  const featureMean: Point = [0, 0]
  const featureScale: Point = [0, 0]
  for (let axis = 0; axis < 2; axis++) {
    featureMean[axis] = points.reduce(
      (sum, point) => sum + point[axis]! / points.length,
      0
    )
    featureScale[axis] = Math.sqrt(
      points.reduce(
        (sum, point) =>
          sum + (point[axis]! - featureMean[axis]!) ** 2 / points.length,
        0
      )
    )
    const resolution =
      Number.EPSILON * 64 * Math.max(1, Math.abs(featureMean[axis]!))
    if (
      !Number.isFinite(featureScale[axis]) ||
      featureScale[axis]! <= resolution
    ) {
      return null
    }
  }
  const model: BasePointSpatialModel = {
    coefficients: [[], []],
    featureMean,
    featureScale,
    spatialBasis,
  }
  const rows = points.map((point) => spatialFeatures(point, model))
  if (rows.some((row) => row === null)) {
    return null
  }
  const finiteRows = rows as number[][]
  const affine = fitScreenCoordinates(
    finiteRows.map((row) => row.slice(0, 3)),
    targets
  )
  if (!affine) {
    return null
  }
  if (spatialBasis === "affine") {
    return { ...model, coefficients: affine }
  }
  // Verify quadratic identifiability before regularization can mask a singular geometry.
  if (!fitScreenCoordinates(finiteRows, targets)) {
    return null
  }
  const penalty = Math.sqrt(regularization * points.length)
  const ridgeRows = [3, 4, 5].map((column) => {
    const row = Array<number>(6).fill(0)
    row[column] = penalty
    return row
  })
  const coefficients = fitScreenCoordinates(
    [...finiteRows, ...ridgeRows],
    [...targets, [0, 0], [0, 0], [0, 0]]
  )
  if (!coefficients) {
    return null
  }
  return { ...model, coefficients }
}

function evaluateCandidate(
  points: Point[],
  targets: Point[],
  spatialBasis: SpatialBasis,
  regularization: number,
  frameGroups: Point[][]
): SpatialCandidate | null {
  const model = fitSpatialMapping(points, targets, spatialBasis, regularization)
  if (!model) {
    return null
  }
  const heldOutModels: BasePointSpatialModel[] = []
  const errors: number[] = []
  for (let index = 0; index < points.length; index++) {
    const heldOutModel = fitSpatialMapping(
      points.filter((_, row) => row !== index),
      targets.filter((_, row) => row !== index),
      spatialBasis,
      regularization
    )
    if (!heldOutModel) {
      return null
    }
    const frameErrors: number[] = []
    const target = targets[index]!
    for (const frame of frameGroups[index]!) {
      const prediction = predictBasePointSpatial(heldOutModel, frame)
      if (!prediction) {
        return null
      }
      frameErrors.push(
        (prediction[0] - target[0]) ** 2 + (prediction[1] - target[1]) ** 2
      )
    }
    // Score the typical held-out frame, not only its median coordinate. This
    // exposes noise amplification while resisting isolated detection spikes.
    frameErrors.sort((left, right) => left - right)
    const middle = Math.floor(frameErrors.length / 2)
    let medianError = frameErrors[middle]!
    if (frameErrors.length % 2 === 0) {
      medianError = (frameErrors[middle - 1]! + medianError) / 2
    }
    errors.push(medianError)
    heldOutModels.push(heldOutModel)
  }
  const squaredError = errors.reduce(
    (sum, value) => sum + value / errors.length,
    0
  )
  const variance = errors.reduce(
    (sum, value) => sum + (value - squaredError) ** 2,
    0
  )
  const standardError = Math.sqrt(
    variance / ((errors.length - 1) * errors.length)
  )
  return { model, regularization, heldOutModels, squaredError, standardError }
}

/** Whole-target CV chooses curvature only when it improves beyond fold uncertainty. */
export function fitBasePointSpatial(
  points: Point[],
  targets: Point[],
  frameGroups: Point[][] = points.map((point) => [point])
): BasePointSpatialFit | null {
  if (
    frameGroups.length !== points.length ||
    frameGroups.some(
      (group) =>
        group.length === 0 ||
        group.some((point) => !point.every(Number.isFinite))
    )
  ) {
    return null
  }
  const affine = evaluateCandidate(points, targets, "affine", 0, frameGroups)
  if (!affine) {
    return null
  }
  let selected = affine
  for (const regularization of [0.0001, 0.01, 0.1, 1]) {
    const candidate = evaluateCandidate(
      points,
      targets,
      "quadratic",
      regularization,
      frameGroups
    )
    if (candidate && candidate.squaredError < selected.squaredError) {
      selected = candidate
    }
  }
  if (
    affine.squaredError <=
    selected.squaredError + selected.standardError + 1e-12
  ) {
    return affine
  }
  return selected
}
