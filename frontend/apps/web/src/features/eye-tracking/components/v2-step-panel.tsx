import type { V2StepPanelProps } from "./v2-step-panel.types"

export function V2StepPanel({
  stepNumber,
  stepName,
  title,
  description,
  error,
  message,
  children,
}: V2StepPanelProps) {
  const statusMessage = error || message

  return (
    <aside className="eye-controls" aria-labelledby="eye-step-title">
      <div className="eye-controls-heading">
        <div>
          <span className="eye-eyebrow">
            STEP {String(stepNumber).padStart(2, "0")} /{" "}
            {stepName.toUpperCase()}
          </span>
          <h2 id="eye-step-title">{title}</h2>
          <p>{description}</p>
        </div>
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
