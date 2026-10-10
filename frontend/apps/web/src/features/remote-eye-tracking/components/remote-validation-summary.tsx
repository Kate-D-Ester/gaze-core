import { Hint } from "../remote-controls"
import {
  RemoteMutedStyles,
  RemoteMetricsStyles,
} from "@/features/tracking-ui/remote-styles"
import type { RemoteValidationSummaryProps } from "./remote-validation-summary.types"
export function RemoteValidationSummary({
  validation,
  adjustedSinceValidation,
  assessment,
  outsideCheckedPose = false,
}: RemoteValidationSummaryProps) {
  let message = assessment.message
  if (outsideCheckedPose && assessment.status === "checked") {
    message =
      "Outside your accuracy-checked head range. Gaze remains available."
  }
  return (
    <>
      <h2>Results</h2>
      {adjustedSinceValidation && (
        <p className={`remote-muted ${RemoteMutedStyles}`}>
          Previous accuracy check · validate your adjustment.
        </p>
      )}
      {!adjustedSinceValidation && (
        <p className={`remote-muted ${RemoteMutedStyles}`} role="status">
          {message}
        </p>
      )}
      {validation && (
        <>
          <div className={`remote-metrics ${RemoteMetricsStyles}`}>
            <Hint label="Mean target error">
              <strong>
                {validation.meanPixels.toFixed(0)}
                <small> px</small>
              </strong>
              <span>Mean</span>
            </Hint>
            <Hint label="95th percentile error">
              <strong>
                {validation.p95Pixels.toFixed(0)}
                <small> px</small>
              </strong>
              <span>P95</span>
            </Hint>
            <Hint label="Within-target jitter">
              <strong>
                {validation.jitterPixels.toFixed(0)}
                <small> px</small>
              </strong>
              <span>Jitter</span>
            </Hint>
          </div>
          <p className={`remote-muted ${RemoteMutedStyles}`}>
            {validation.targetCount} targets · {validation.sampleCount} samples
            {validation.validFraction !== undefined &&
              ` · ${(validation.validFraction * 100).toFixed(0)}% output`}
          </p>
        </>
      )}
    </>
  )
}
