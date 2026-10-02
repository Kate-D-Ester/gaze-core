import { useId } from "react"
import { HelpTip } from "./help-tip"
import type { V2StepPanelProps } from "./v2-step-panel.types"

export function V2StepPanel({
  stepName,
  description,
  error,
  message,
  children,
}: V2StepPanelProps) {
  const headingId = useId()
  const statusMessage = error || message

  return (
    <aside className="eye-controls" aria-labelledby={headingId}>
      <div className="eye-controls-heading">
        <h2 id={headingId}>{stepName}</h2>
        <HelpTip text={description} label={`${stepName} help`} />
      </div>
      <div className="eye-controls-body">
        {statusMessage && (
          <p
            className={error ? "eye-message error" : "eye-message"}
            role={error ? "alert" : "status"}
          >
            {statusMessage}
          </p>
        )}
        {children}
      </div>
    </aside>
  )
}
