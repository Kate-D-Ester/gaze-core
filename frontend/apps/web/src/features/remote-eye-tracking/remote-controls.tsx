import type { ComponentProps, ReactNode } from "react"
import { Info, type LucideIcon } from "lucide-react"

export function Hint({
  label,
  children,
  className = "",
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`remote-hint ${className}`}
      aria-label={label}
      tabIndex={0}
    >
      {children}
      <span className="remote-tooltip" aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
export function IconButton({
  label,
  icon: Icon,
  primary = false,
  className = "",
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: string
  icon: LucideIcon
  primary?: boolean
}) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      className={`remote-icon-button ${primary ? "primary" : ""} ${className}`}
    >
      <Icon size={19} aria-hidden="true" />
      <span className="remote-tooltip" aria-hidden="true">
        {label}
      </span>
    </button>
  )
}
/** Tap-to-open help remains available on touch screens where hover is unavailable. */
export function SetupHelp({ preparation }: { preparation?: string }) {
  return (
    <details
      className="remote-help"
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.open = false
      }}
    >
      <summary className="remote-icon-button" aria-label="Setup help">
        <Info size={18} aria-hidden="true" />
        <span className="remote-tooltip" aria-hidden="true">
          Help
        </span>
      </summary>
      <div className="remote-help-body">
        <strong>Setup help</strong>
        {preparation && <p>{preparation}</p>}
        <p>
          Phone camera access needs HTTPS. Keep the device in place and use even
          front lighting.
        </p>
        <p>
          Follow each dot. The head-movement pass records gentle turns or shifts
          while you keep looking at the target.
        </p>
        <p>
          Tracking stays on this device. Results are calibrated 2D screen gaze;
          validate accuracy for your setup. IR needs a clear pupil and corneal
          reflection.
        </p>
        <p>Research trial. Commercial model rights need verification.</p>
        <div className="remote-help-links">
          <a
            href="https://arxiv.org/html/2508.19544v1"
            target="_blank"
            rel="noreferrer"
          >
            WebEyeTrack
          </a>
          <a
            href="https://arxiv.org/html/2508.10268v1"
            target="_blank"
            rel="noreferrer"
          >
            Head calibration
          </a>
        </div>
      </div>
    </details>
  )
}
