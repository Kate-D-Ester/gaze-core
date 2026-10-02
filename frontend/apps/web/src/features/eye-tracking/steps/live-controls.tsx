import {
  Crosshair,
  ChevronDown,
  RotateCcw,
  Download,
  Maximize2,
  UserRound,
} from "lucide-react"
import { GazeOffsetControls } from "../components/gaze-offset-controls"
import { EyeActionButton } from "../components/eye-action-button"
import { HelpTip } from "../components/help-tip"
import type { LiveControlsProps } from "./live-controls.types"

export function LiveControls({
  tracker,
  calibration,
  screenPoint,
  validation,
  usable,
  gazeMessage,
  headCompensated,
  onRetryHeadCalibration,
  retryHeadDisabled = false,
  onFocus,
  onValidate,
  onRecalibrate,
  onExport,
  offset,
  onOffsetChange,
}: LiveControlsProps) {
  const { source, frame } = tracker
  const onscreen = screenPoint && screenPoint.every((v) => v >= 0 && v <= 1)
  let positionLabel = "Gaze is outside this view"

  if (!screenPoint) {
    positionLabel = gazeMessage
  } else if (onscreen) {
    positionLabel = "Screen position"
  }

  return (
    <>
      <div className="eye-gaze-map">
        <span className="map-center-x" />
        <span className="map-center-y" />
        {onscreen && (
          <i
            style={{
              left: `${screenPoint![0] * 100}%`,
              top: `${screenPoint![1] * 100}%`,
            }}
          />
        )}
        <span>{positionLabel}</span>
      </div>
      <div className="eye-live-coordinates">
        <span>
          X <b>{screenPoint ? `${(screenPoint[0] * 100).toFixed(1)}%` : "—"}</b>
        </span>
        <span>
          Y <b>{screenPoint ? `${(screenPoint[1] * 100).toFixed(1)}%` : "—"}</b>
        </span>
        {headCompensated && (
          <span
            className="eye-status-indicator"
            role="img"
            aria-label="Head compensation active"
            title="Head compensation active"
            data-tooltip="Head compensation active"
          >
            <UserRound size={16} aria-hidden="true" />
          </span>
        )}
        {!headCompensated && <span>Eye-only</span>}
      </div>
      <div className="eye-action-row" role="group" aria-label="Gaze actions">
        <EyeActionButton
          label="Open gaze view"
          className="eye-button primary"
          disabled={!calibration}
          onClick={onFocus}
        >
          <Maximize2 size={17} aria-hidden="true" />
        </EyeActionButton>
        <EyeActionButton
          label="Validate with 5 points"
          disabled={!usable || !calibration}
          onClick={onValidate}
        >
          <Crosshair size={17} aria-hidden="true" />
        </EyeActionButton>
        <EyeActionButton label="Recalibrate" onClick={onRecalibrate}>
          <RotateCcw size={17} aria-hidden="true" />
        </EyeActionButton>
        {onRetryHeadCalibration && (
          <EyeActionButton
            label="Retry head movements"
            disabled={!usable || retryHeadDisabled}
            onClick={onRetryHeadCalibration}
          >
            <UserRound size={17} aria-hidden="true" />
          </EyeActionButton>
        )}
        <EyeActionButton
          label="Export result"
          disabled={!frame}
          onClick={onExport}
        >
          <Download size={17} aria-hidden="true" />
        </EyeActionButton>
      </div>
      <GazeOffsetControls
        offset={offset}
        width={window.innerWidth}
        height={window.innerHeight}
        disabled={!calibration}
        onChange={onOffsetChange}
      />
      <div className="eye-validation">
        <span>
          {source?.kind === "sample" ? "Simulated error" : "Validation error"}
        </span>
        <strong>
          {validation === null ? "—" : `${validation.toFixed(0)} px RMS`}
        </strong>
        <HelpTip
          label="Validation details"
          text={`Five-point validation reports pixel RMS error. Held-out calibration error: ${calibration ? (calibration.validationError * 100).toFixed(1) + "%" : "not measured"}.`}
        />
      </div>
      <details className="eye-details">
        <summary>
          Gaze vector
          <ChevronDown size={14} />
        </summary>
        <code>
          {frame?.gaze
            ? frame.gaze.direction.map((v) => v.toFixed(4)).join(", ")
            : "No valid gaze"}
        </code>
        <HelpTip
          label="Gaze vector help"
          text="Camera coordinates: right, down, away. Direction is a unit vector; screen position uses your calibration."
        />
      </details>
    </>
  )
}
