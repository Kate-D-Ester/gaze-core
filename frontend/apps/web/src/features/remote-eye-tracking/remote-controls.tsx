import { FileVideo, Info } from "lucide-react"
import { useRef, type ComponentProps } from "react"
import {
  RemoteHelpBodyStyles,
  RemoteHelpLinksStyles,
  RemoteHelpStyles,
  RemoteHintStyles,
  RemoteIconButtonStyles,
  RemoteTooltipStyles,
} from "../tracking-ui/remote-styles"
import type {
  HintProps,
  IconButtonProps,
  LocalVideoButtonProps,
  SetupHelpProps,
} from "./remote-controls.types"
export function Hint({ label, children, className = "" }: HintProps) {
  return (
    <span
      className={`remote-hint ${RemoteHintStyles} ${className}`}
      aria-label={label}
      tabIndex={0}
    >
      {children}
      <span
        className={`remote-tooltip ${RemoteTooltipStyles}`}
        aria-hidden="true"
      >
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
}: Omit<ComponentProps<"button">, "children"> & IconButtonProps) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      className={`remote-icon-button ${RemoteIconButtonStyles} ${primary ? "primary" : ""} ${className}`}
    >
      <Icon size={19} aria-hidden="true" />
      <span
        className={`remote-tooltip ${RemoteTooltipStyles}`}
        aria-hidden="true"
      >
        {label}
      </span>
    </button>
  )
}
/** The file remains a browser-local source; it is never uploaded. */
export function LocalVideoButton({ onSelect }: LocalVideoButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.ogv"
        aria-label="Choose a local video"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) {
            onSelect(file)
          }
        }}
      />
      <IconButton
        label="Inspect a local video"
        icon={FileVideo}
        onClick={() => input.current?.click()}
      />
    </>
  )
}
/** Tap-to-open help remains available on touch screens where hover is unavailable. */
export function SetupHelp({ preparation }: SetupHelpProps) {
  return (
    <details
      className={`remote-help ${RemoteHelpStyles}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false
        }
      }}
    >
      <summary
        className={`remote-icon-button ${RemoteIconButtonStyles}`}
        aria-label="Setup help"
      >
        <Info size={18} aria-hidden="true" />
        <span
          className={`remote-tooltip ${RemoteTooltipStyles}`}
          aria-hidden="true"
        >
          Help
        </span>
      </summary>
      <div className={`remote-help-body ${RemoteHelpBodyStyles}`}>
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
          validate accuracy for your setup. IR eye regions and thresholds are
          automatic. Close-up reflection tracking needs a clear corneal
          reflection.
        </p>
        <p>
          Open a local video to inspect pupils and head pose. Playback and
          seeking stay on this device. Recorded frames cannot calibrate screen
          gaze.
        </p>
        <p>Research trial. Commercial model rights need verification.</p>
        <div className={`remote-help-links ${RemoteHelpLinksStyles}`}>
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
