import type {
  CalibrationSample,
  PersonalizedInputKind,
  RemoteCalibration,
} from "./remote-eye-tracking.types"

/** Held-out empirical motion learning, not a physical 3D calibration or accuracy certificate. */
export type RemoteMotionFit = {
  version: "joint-motion-v1"
  baselineMotionRms: number
  motionRms: number
  spatialRms: number
  observedAxes: number[]
  sampleCount: number
  durationMs: number
}

export type RemoteMapping = Pick<
  RemoteCalibration,
  "featureMean" | "featureScale" | "coefficients"
>
export type MotionFitScore = {
  model: RemoteCalibration
  loss: number
  standardError: number
}

export type MotionFitReadings = {
  baseline: RemoteCalibration
  grid: CalibrationSample[]
  motion: CalibrationSample[]
  kind: PersonalizedInputKind | null
  baselineBlocks: number[]
  observedAxes: number[]
  durationMs: number
  sourceVersion: string
}
