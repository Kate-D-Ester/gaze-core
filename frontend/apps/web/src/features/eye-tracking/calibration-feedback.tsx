import type { CalibrationFeedbackProps } from "./calibration-feedback.types"

/** Keep instructions near fixation without moving the calibrated target coordinates. */
export function CalibrationFeedback({
  target,
  label,
  instruction,
  action,
}: CalibrationFeedbackProps) {
  return (
    <div
      className="eye-calibration-feedback"
      style={{
        left: `clamp(12px, calc(${target[0] * 100}% - var(--eye-feedback-width) / 2), calc(100% - var(--eye-feedback-width) - 12px))`,
        top: `calc(${target[1] * 100}% + var(--eye-feedback-gap))`,
      }}
    >
      {label && <span className="eye-calibration-caption">{label}</span>}
      <div className="eye-calibration-guidance">
        <p role="status">{instruction}</p>
      </div>
      {action && (
        <div
          className="eye-calibration-action"
          style={{
            left: `${target[0] * 100}%`,
            top: `${target[1] * 100}%`,
            transform:
              target[0] > 0.5
                ? "translate(-60px, -50%)"
                : "translate(20px, -50%)",
          }}
        >
          {action}
        </div>
      )}
    </div>
  )
}
