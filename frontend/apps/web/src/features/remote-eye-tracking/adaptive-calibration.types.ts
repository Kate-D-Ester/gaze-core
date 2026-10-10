import type { BasePointFitIssue } from "./base-point-calibration.types"
import type { CaptureViewport } from "./calibration-overlay.types"
import type {
  CalibrationSample,
  Point,
  RemoteCalibration,
  RemoteMode,
} from "./remote-eye-tracking.types"

export type AdaptiveCalibrationFailure = {
  fitIssue: BasePointFitIssue
  targets: Point[]
}
export type AdaptiveCalibrationResult = {
  model: RemoteCalibration
  samples: CalibrationSample[]
  headSamples: CalibrationSample[]
  // A training result is never evidence of independent accuracy.
  validation: null
  accuracyVerified: false
  viewport: CaptureViewport
  headMovementLearned: boolean
  headCorrectionUpdated: boolean
}
export type AdaptiveHeadCalibration = {
  model: RemoteCalibration
  samples: CalibrationSample[]
  viewport: CaptureViewport
}
export type AdaptiveCalibrationState = {
  mode: RemoteMode
  headMovement: boolean
  phase: "personal" | "head" | "complete" | "failed"
  training: CalibrationSample[]
  setupTargets: Point[]
  candidate: RemoteCalibration | null
  failure: AdaptiveCalibrationFailure | null
  result: AdaptiveCalibrationResult | null
}
