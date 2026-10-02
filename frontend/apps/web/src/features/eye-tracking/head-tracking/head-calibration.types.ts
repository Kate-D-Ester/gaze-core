import type { AffineCoefficients } from "../calibration-mapping.types"
import type { CalibrationFitIssue } from "../calibration-result.types"
import type { GazeOrientation } from "../calibration.types"
import type { HeadGazeModel } from "./head-gaze-model.types"
import type { HeadPose } from "./head-pose.types"
import type { HeadPoseEnvelope } from "./head-ray-model.types"

export type HeadCompensation = HeadGazeModel & {
  reference: HeadPose
  orientation: GazeOrientation
  coefficients: AffineCoefficients
  validationError: number
  envelope: HeadPoseEnvelope
  maximumValidationError: number
}

export type HeadCompensationFitResult = {
  model: HeadCompensation | null
  issue: CalibrationFitIssue | null
}
