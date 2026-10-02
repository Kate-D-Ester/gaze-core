import { Crosshair, Download, Move, RefreshCw } from "lucide-react"
import type { SceneSession, SceneSessionSnapshot } from "./scene-session"
import { GazeOffsetControls } from "./gaze-offset-controls"
import { download } from "./download"

export function ValidationRecoveryControls({
  session,
  state,
  canCapture,
  prepare = () => {},
}: {
  session: SceneSession
  state: SceneSessionSnapshot
  canCapture: boolean
  prepare?: () => void
}) {
  const result = state.validation
  const dimensions = state.calibration?.holds[0]?.pairs[0]
  if (!result || result.passed || !dimensions) return null
  const suggested = result.suggestedOffset
  const unchanged = state.offset.every(
    (value, i) => value === (result.offset?.[i] ?? 0)
  )
  const position = state.measurement?.preview
    ? state.measurement.position
    : null
  return (
    <div className="scene-validation-recovery">
      <div className="eye-guidance-row">
        <span className="scene-preview-warning">Unverified preview</span>
        <button
          className="eye-button secondary eye-action-icon"
          aria-label="Download calibration diagnostics"
          data-tooltip="Save check diagnostics"
          title="Save calibration, validation pairs, per-point errors and the applied offset on this device"
          onClick={() =>
            download(
              new Blob(
                [
                  JSON.stringify(
                    {
                      version: 1,
                      delayMs: state.delayMs,
                      offset: state.offset,
                      calibration: state.calibration,
                      validation: result,
                      validationHolds: state.collection?.holds,
                    },
                    null,
                    2
                  ),
                ],
                { type: "application/json" }
              ),
              "scene-calibration-diagnostics.json"
            )
          }
        >
          <Download size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="scene-metrics">
        <div>
          <span>
            {unchanged ? "Accuracy check" : "Previous accuracy check"}
          </span>
          <strong>
            {result.pixelRms.toFixed(1)} px RMS · worst{" "}
            {result.maxPixelError.toFixed(1)} px
          </strong>
        </div>
        {result.points && (
          <div
            className="scene-validation-points"
            aria-label="Error at each validation point"
          >
            {result.points.map((point) => (
              <span
                key={point.index}
                title={`Point ${point.index + 1}: X error ${point.pixelDelta[0].toFixed(1)} px, Y error ${point.pixelDelta[1].toFixed(1)} px. Positive is right/down from the fingertip.`}
              >
                <small>{point.index + 1}</small>
                {point.pixelError.toFixed(0)} px
              </span>
            ))}
          </div>
        )}
        <div>
          <span>Gaze preview</span>
          <strong>
            {position
              ? `${(position[0] * 100).toFixed(1)}%, ${(position[1] * 100).toFixed(1)}%`
              : "Waiting…"}
          </strong>
        </div>
      </div>
      <GazeOffsetControls
        offset={state.offset}
        width={dimensions.width}
        height={dimensions.height}
        disabled={!!state.capture}
        onChange={(offset) => session.setOffset(offset)}
      />
      {suggested && unchanged && (
        <button
          className="eye-button primary"
          aria-label="Apply suggested offset and check accuracy"
          title={`Try X ${(suggested[0] * dimensions.width).toFixed(1)} px, Y ${(suggested[1] * dimensions.height).toFixed(1)} px, then check five new fixations. The nine calibration points are kept.`}
          disabled={!canCapture}
          onClick={() => {
            prepare()
            session.setOffset(suggested)
            session.startCapture("validation")
          }}
        >
          <Move size={16} aria-hidden="true" /> Try offset & check
        </button>
      )}
      {result.retryIndex != null && unchanged && (
        <button
          className="eye-button primary"
          disabled={!canCapture}
          onClick={() => {
            prepare()
            session.retryValidationPoint()
          }}
        >
          <RefreshCw size={16} aria-hidden="true" /> Repeat point{" "}
          {result.retryIndex + 1}
        </button>
      )}
      <button
        className="eye-button secondary"
        disabled={!canCapture}
        onClick={() => {
          prepare()
          session.startCapture("validation")
        }}
      >
        <Crosshair size={16} aria-hidden="true" /> Check again
      </button>
    </div>
  )
}
