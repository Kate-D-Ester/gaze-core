import { ChevronDown } from "lucide-react"
import type { Rect } from "../types"
import type { TrackerController } from "../use-tracker"

export function RegionControls({
  tracker,
  eyeConfirmed,
  onConfirm,
  chooseRegion,
}: {
  tracker: TrackerController
  eyeConfirmed: boolean
  onConfirm: (value: boolean) => void
  chooseRegion: (roi: Rect) => void
}) {
  const { settings } = tracker
  return (
    <>
      <h3>Keep the whole eye in view.</h3>
      <p className="eye-muted">
        Include room for looking in every direction. Leave out the other eye,
        eyebrows and dark frame edges.
      </p>
      <button
        className="eye-button secondary"
        onClick={() =>
          chooseRegion({
            x: 0,
            y: 0,
            width: tracker.dimensions.width,
            height: tracker.dimensions.height,
          })
        }
      >
        Use full frame
      </button>
      <label className="eye-check">
        <input
          type="checkbox"
          checked={eyeConfirmed}
          onChange={(e) => {
            onConfirm(e.target.checked)
          }}
        />
        I can clearly see one pupil.
      </label>
      <details className="eye-details">
        <summary>
          Region coordinates
          <ChevronDown size={14} />
        </summary>
        <div className="eye-number-grid">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label className="eye-field" key={key}>
              {key}
              <input
                type="number"
                value={settings.roi[key]}
                min={key === "x" || key === "y" ? 0 : 24}
                max={
                  key === "x" || key === "width"
                    ? tracker.dimensions.width
                    : tracker.dimensions.height
                }
                onChange={(e) => {
                  const next = {
                      ...settings.roi,
                      [key]: Math.round(Number(e.target.value)),
                    },
                    width = tracker.dimensions.width,
                    height = tracker.dimensions.height
                  if (
                    next.x >= 0 &&
                    next.y >= 0 &&
                    next.width >= 24 &&
                    next.height >= 24 &&
                    next.x + next.width <= width &&
                    next.y + next.height <= height
                  )
                    chooseRegion(next)
                }}
              />
            </label>
          ))}
        </div>
      </details>
    </>
  )
}
