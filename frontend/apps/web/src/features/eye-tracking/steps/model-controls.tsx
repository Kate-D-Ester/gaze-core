import { ChevronDown, RotateCcw } from "lucide-react"
import { HelpTip } from "../components/help-tip"
import { SpherePreview } from "../components/sphere-preview"
import { getEyeModelLockStatus } from "../eye-model"
import type { Point } from "../eye-tracking.types"
import type { ModelControlsProps } from "./model-controls.types"

export function ModelControls({
  tracker,
  corner,
  update,
  setNotice,
}: ModelControlsProps) {
  const { settings, frame } = tracker
  const lockStatus = getEyeModelLockStatus(
    frame?.model ?? null,
    frame?.width ?? 0,
    frame?.height ?? 0,
    frame?.roi.width ?? 0,
    frame?.roi.height ?? 0
  )
  let modelHeading = "Look around the full range."
  let modelGuidance = "Move your gaze toward each edge and corner."
  if (lockStatus.blocker === "coverage") {
    const directionsRemaining = Math.max(
      0,
      lockStatus.requiredDirections - lockStatus.coveredDirections
    )
    let directionLabel = "directions"
    if (directionsRemaining === 1) directionLabel = "direction"
    modelHeading = "Explore a few directions."
    modelGuidance = `Keep your head still. Move your pupil into ${directionsRemaining} more distinct ${directionLabel} in the camera preview.`
  } else if (lockStatus.ready) {
    modelHeading = "Ready to lock."
    modelGuidance = "The eye model has a stable fit across enough movement."
  }
  let cornerDescription = "Click the inner, then outer eye corner."
  if (corner) {
    cornerDescription = "Click the opposite eye corner."
  } else if (settings.corners) {
    cornerDescription = "Points saved."
  }
  return (
    <>
      <SpherePreview frame={frame} />
      {settings.format === "classic" ? (
        <>
          <div className="eye-guidance-row">
            <p className="eye-muted" role="status" aria-live="polite">
              {cornerDescription}
            </p>
            <HelpTip
              label="Manual eye model help"
              text="Choose Create and click the inner, then outer eye corner. Edit lets you drag a + endpoint to resize the circle, or drag inside it to move the model."
            />
          </div>
          <div className="eye-number-grid">
            {[0, 1].map((i) => (
              <label className="eye-field" key={i}>
                Corner {i + 1} · x
                <input
                  type="number"
                  value={settings.corners?.[i][0] ?? (i === 0 ? 180 : 460)}
                  onChange={(e) => {
                    const corners: [Point, Point] = settings.corners
                      ? [[...settings.corners[0]], [...settings.corners[1]]]
                      : [
                          [180, 240],
                          [460, 240],
                        ]
                    corners[i][0] = Number(e.target.value)
                    update({ corners })
                  }}
                />
              </label>
            ))}
          </div>
          <button
            className="eye-text-button"
            onClick={() =>
              update({
                corners: [
                  [
                    settings.roi.x + settings.roi.width * 0.15,
                    settings.roi.y + settings.roi.height * 0.5,
                  ],
                  [
                    settings.roi.x + settings.roi.width * 0.85,
                    settings.roi.y + settings.roi.height * 0.5,
                  ],
                ],
              })
            }
          >
            Reset corners
          </button>
        </>
      ) : (
        <>
          <div className="eye-guidance-row">
            <p className="eye-muted" role="status">
              {modelHeading}
            </p>
            <HelpTip label="Eye model readiness help" text={modelGuidance} />
          </div>
          <div
            className="eye-progress-track"
            role="progressbar"
            aria-label="Eye model readiness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={lockStatus.progress}
          >
            <i style={{ width: `${lockStatus.progress}%` }} />
          </div>
        </>
      )}
      <button
        className="eye-button secondary eye-action-icon"
        aria-label="Rebuild model"
        title="Rebuild model"
        data-tooltip="Rebuild model"
        onClick={() => {
          update({ locked: false })
          setNotice("Look around to rebuild.")
        }}
      >
        <RotateCcw size={15} />
      </button>
      {settings.format === "spatial" && (
        <details className="eye-details">
          <summary>
            Camera geometry
            <ChevronDown size={14} />
          </summary>
          <label className="eye-field">
            Vertical field of view · degrees
            <input
              type="number"
              min="10"
              max="140"
              value={settings.fov}
              onChange={(e) => {
                const fov = Number(e.target.value)
                if (fov >= 10 && fov <= 140) update({ fov })
              }}
            />
          </label>
          <label className="eye-field">
            Assumed eye radius · mm
            <input
              type="number"
              min="8"
              max="16"
              step="0.1"
              value={settings.radiusMm}
              onChange={(e) => {
                const radiusMm = Number(e.target.value)
                if (radiusMm >= 8 && radiusMm <= 16) update({ radiusMm })
              }}
            />
          </label>
          <p className="eye-small">
            45° and 12 mm are model assumptions. Use your camera’s measured
            field of view for a better scale estimate.
          </p>
        </details>
      )}
    </>
  )
}
