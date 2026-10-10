import type { CalibrationSample, Point } from "./remote-eye-tracking.types"

export type RemoteMotionHold = {
  samples: CalibrationSample[]
  observedAxes: number[]
  durationMs: number
}

/** Empirical fixed-fixation residual. This is fitted evidence, not independent accuracy validation. */
export type RemoteHeadCorrection = {
  /** yaw, pitch, roll, image x, image y, log apparent scale at the spatial calibration pose. */
  reference: number[]
  scale: number[]
  coefficients: [number[], number[]]
  observedAxes: number[]
  poseSamples: number[][]
  poseBounds: { min: number[]; max: number[] }
  regularization: number
  baselineRms: number
  correctedRms: number
  sampleCount: number
  durationMs: number
  /** Bound learned residual magnitude when the wearer moves beyond captured motion. */
  maxCorrection: number
}

export type HeadResidualSample = {
  pose: number[]
  residual: Point
  timestamp: number
}

export type HeadCorrectionFitScore = {
  regularization: number
  correctedRms: number
}
