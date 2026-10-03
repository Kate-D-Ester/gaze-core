import { X } from "lucide-react"
import { GazeBubbleOverlay } from "../gaze-bubble/gaze-bubble-overlay"
import { EyeEyebrowStyles } from "../tracking-ui/layout-styles"
import {
  EyeFocusCaptionStyles,
  EyeFocusViewStyles,
} from "../tracking-ui/calibration-styles"
import { EyeHeadFloatingStyles } from "../tracking-ui/head-tracking-styles"
import { EyeIconButtonStyles } from "../tracking-ui/control-styles"
import { HeadPreview } from "./head-tracking/head-preview"
import type { LiveGazeOverlayProps } from "./live-gaze-overlay.types"
/** Uses the same full-viewport origin and normalized coordinates as calibration. */
export function LiveGazeOverlay({
  point,
  timestamp,
  validationErrorPixels,
  resetKey,
  offset,
  title,
  simulated,
  head,
  onClose,
}: LiveGazeOverlayProps) {
  return (
    <div
      className={`eye-focus-view ${EyeFocusViewStyles}`}
      role="dialog"
      aria-modal="true"
      aria-label="Live gaze view"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose()
        }
      }}
    >
      <button
        autoFocus
        className={`eye-icon-button ${EyeIconButtonStyles}`}
        onClick={onClose}
        aria-label="Close gaze view"
        title="Close gaze view (Esc)"
      >
        <X />
      </button>
      <div className={`eye-focus-caption ${EyeFocusCaptionStyles}`}>
        <span className={`eye-eyebrow ${EyeEyebrowStyles}`}>
          {simulated ? "SYNTHETIC SAMPLE" : "LIVE GAZE"}
        </span>
        <h2>{title}</h2>
        <p>
          The bubble steadies while you look at one spot. Its size stays capped.
        </p>
      </div>
      {head.enabled && (
        <div className={`eye-head-floating ${EyeHeadFloatingStyles}`}>
          <HeadPreview head={head} compact />
        </div>
      )}
      <GazeBubbleOverlay
        point={point}
        timestamp={timestamp}
        errorRadiusPx={validationErrorPixels}
        verified={validationErrorPixels !== null}
        resetKey={resetKey}
        offset={offset}
        markerClassName="eye-live-dot"
      />
    </div>
  )
}
