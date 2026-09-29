import { ChevronDown, RotateCcw, X } from "lucide-react"
import { useState } from "react"
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
  const [showCornerInstructions, setShowCornerInstructions] = useState(true)
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
  let cornerHeading = "Create the eye model."
  let cornerDescription = "Choose Create, then click both eye corners."
  if (corner) {
    cornerHeading = "Choose the opposite eye corner."
    cornerDescription = "The first point is marked. Click the opposite corner."
  } else if (settings.corners) {
    cornerHeading = "Eye model points saved."
    cornerDescription =
      "Choose Edit to move or resize the model. Choose Create to replace both points."
  }
  return (
    <>
      <SpherePreview frame={frame} />
      {settings.format === "classic" ? (
        <>
          {showCornerInstructions && (
            <aside
              className="eye-corner-instructions"
              aria-label="Manual eye corner instructions"
              role="note"
            >
              <div>
                <strong>Create or edit the eye model</strong>
                <p>
                  Choose Create and click the inner, then outer eye corner. Edit
                  lets you drag a + endpoint to resize the circle, or drag
                  inside it to move the model.
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss corner instructions"
                onClick={() => setShowCornerInstructions(false)}
              >
                <X size={14} />
              </button>
            </aside>
          )}
          <h3>{cornerHeading}</h3>
          <p className="eye-muted" role="status" aria-live="polite">
            {cornerDescription}
          </p>
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
            Use region-based starting corners
          </button>
        </>
      ) : (
        <>
          <h3>{modelHeading}</h3>
          <p className="eye-muted">{modelGuidance}</p>
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
        className="eye-button secondary"
        onClick={() => {
          update({ locked: false })
          setNotice("Look around to rebuild.")
        }}
      >
        <RotateCcw size={15} />
        Rebuild model
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
