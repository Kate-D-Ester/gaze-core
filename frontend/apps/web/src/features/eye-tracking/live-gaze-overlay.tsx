import { X } from "lucide-react"
import { HeadPreview } from "./head-tracking/head-preview"
import type { LiveGazeOverlayProps } from "./live-gaze-overlay.types"

/** Uses the same full-viewport origin and normalized coordinates as calibration. */
export function LiveGazeOverlay({
  point,
  title,
  simulated,
  head,
  onClose,
}: LiveGazeOverlayProps) {
  const onscreen =
    point &&
    point.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  return (
    <div
      className="eye-focus-view"
      role="dialog"
      aria-modal="true"
      aria-label="Live gaze view"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose()
      }}
    >
      <button
        autoFocus
        className="eye-icon-button"
        onClick={onClose}
        aria-label="Close gaze view"
        title="Close gaze view (Esc)"
      >
        <X />
      </button>
      <div className="eye-focus-caption">
        <span className="eye-eyebrow">
          {simulated ? "SYNTHETIC SAMPLE" : "LIVE GAZE"}
        </span>
        <h2>{title}</h2>
        <p>Your gaze dot follows your calibrated screen position.</p>
      </div>
      {head.enabled && (
        <div className="eye-head-floating">
          <HeadPreview head={head} compact />
        </div>
      )}
      {onscreen && point && (
        <i
          className="eye-live-dot"
          style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }}
        />
      )}
    </div>
  )
}
