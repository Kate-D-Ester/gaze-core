import type { RemoteCalibration } from "./remote-eye-tracking.types"

export type SpatialBasis = "affine" | "quadratic"

export type BasePointSpatialModel = Pick<
  RemoteCalibration,
  "coefficients" | "featureMean" | "featureScale" | "spatialBasis"
>

export type BasePointSpatialFit = {
  model: BasePointSpatialModel
  regularization: number
  heldOutModels: BasePointSpatialModel[]
}

export type SpatialCandidate = BasePointSpatialFit & {
  squaredError: number
  standardError: number
}
