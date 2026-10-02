import type { ValidationResult } from "../remote-eye-tracking.types"
export type RemoteValidationSummaryProps = {
  validation: ValidationResult
  adjustedSinceValidation: boolean
  needsCalibration: boolean
}
