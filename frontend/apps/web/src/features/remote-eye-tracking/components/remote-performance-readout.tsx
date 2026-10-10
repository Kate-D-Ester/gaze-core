import { StatusLightStyles } from "../../tracking-ui/layout-styles"
import {
  RemoteCameraStatusStyles,
  RemoteHelpBodyStyles,
  RemoteHelpStyles,
} from "../../tracking-ui/remote-styles"
import { remotePerformanceText } from "./readout-format"
import type { RemotePerformanceReadoutProps } from "./remote-performance-readout.types"

/** Tap the existing FPS readout for diagnostics without adding a permanent panel. */
export function RemotePerformanceReadout({
  fps,
  ready,
  status,
  observation,
}: RemotePerformanceReadoutProps) {
  return (
    <details
      className={RemoteHelpStyles}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false
        }
      }}
    >
      <summary
        aria-label="Tracking performance"
        title="Tracking performance"
        className={`remote-camera-status cursor-pointer ${RemoteCameraStatusStyles}`}
      >
        <span
          className={`status-light ${StatusLightStyles} ${ready ? "on" : ""}`}
        />
        {ready ? `${fps.toFixed(0)} fps` : status}
      </summary>
      <div className={RemoteHelpBodyStyles}>
        {remotePerformanceText(observation)}
      </div>
    </details>
  )
}
