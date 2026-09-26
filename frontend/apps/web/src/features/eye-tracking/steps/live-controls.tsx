import { Crosshair, ChevronDown, RotateCcw, Download } from "lucide-react"
import type { Point, Calibration } from "../types"
import type { TrackerController } from "../use-tracker"

export function LiveControls({
  tracker,
  calibration,
  screenPoint,
  validation,
  usable,
  onFocus,
  onValidate,
  onRecalibrate,
  onExport,
}: {
  tracker: TrackerController
  calibration: Calibration | null
  screenPoint: Point | null
  validation: number | null
  usable: boolean
  onFocus: () => void
  onValidate: () => void
  onRecalibrate: () => void
  onExport: () => void
}) {
  const { source, frame } = tracker
  const onscreen = screenPoint && screenPoint.every((v) => v >= 0 && v <= 1)
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
        <span>
          {!screenPoint
            ? "Pupil lost"
            : onscreen
              ? "Screen position"
              : "Gaze is outside this view"}
        </span>
      </div>
      <div className="eye-live-coordinates">
        <span>
          X <b>{screenPoint ? `${(screenPoint[0] * 100).toFixed(1)}%` : "—"}</b>
        </span>
        <span>
          Y <b>{screenPoint ? `${(screenPoint[1] * 100).toFixed(1)}%` : "—"}</b>
        </span>
      </div>
      <button
        className="eye-button primary"
        disabled={!calibration}
        onClick={onFocus}
      >
        Open gaze view
        <Crosshair size={16} />
      </button>
      <button
        className="eye-button secondary"
        disabled={!usable || !calibration}
        onClick={onValidate}
      >
        Validate with 5 points
      </button>
      <div className="eye-validation">
        <span>
          {source?.kind === "sample"
            ? "Simulated validation"
            : "Validation error"}
        </span>
        <strong>
          {validation === null
            ? "Not measured"
            : `${validation.toFixed(0)} px RMS`}
        </strong>
        <small>
          {calibration
            ? `${(calibration.validationError * 100).toFixed(1)}% held-out calibration error`
            : ""}
        </small>
      </div>
      <button className="eye-text-button" onClick={onRecalibrate}>
        <RotateCcw size={14} />
        Recalibrate
      </button>
      <button className="eye-text-button" disabled={!frame} onClick={onExport}>
        <Download size={14} />
        Export result
      </button>
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
        <p className="eye-small">
          Camera coordinates: right, down, away. Direction is a unit vector.
          Screen position uses your calibration.
        </p>
      </details>
    </>
  )
}
