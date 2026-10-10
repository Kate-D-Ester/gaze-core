import type { ValidationAssessment } from "../../tracking-calibration/validation-assessment.types"
import type { ValidationResult } from "../remote-eye-tracking.types"
export type RemoteValidationSummaryProps = {
  validation: ValidationResult | null
  adjustedSinceValidation: boolean
  outsideCheckedPose?: boolean
  assessment: ValidationAssessment
}
