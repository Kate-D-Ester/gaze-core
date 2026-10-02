import { useState } from "react"
import { ChevronDown, Maximize } from "lucide-react"
import type { Rect } from "../eye-tracking.types"
import type { RegionControlsProps, RegionDraft } from "./region-controls.types"

const REGION_FIELD_LABELS = {
  x: "Left",
  y: "Top",
  width: "Width",
  height: "Height",
} as const
import { clampRegion, MIN_REGION_SIZE } from "../roi"

export function RegionControls({ tracker, chooseRegion }: RegionControlsProps) {
  const roi = tracker.settings.roi
  const [edit, setEdit] = useState<RegionDraft | null>(null)
  const values =
    edit?.original === roi
      ? edit.values
      : {
          x: String(roi.x),
          y: String(roi.y),
          width: String(roi.width),
          height: String(roi.height),
        }
  const next = clampRegion(
    {
      x: Number(values.x),
      y: Number(values.y),
      width: Number(values.width),
      height: Number(values.height),
    },
    tracker.dimensions
  )
  const changed =
    next.x !== roi.x ||
    next.y !== roi.y ||
    next.width !== roi.width ||
    next.height !== roi.height
  const dirty = Object.keys(values).some(
    (key) => values[key as keyof Rect] !== String(roi[key as keyof Rect])
  )
  return (
    <>
      <button
        className="eye-text-button"
        title="Use the full camera frame"
        onClick={() => chooseRegion({ x: 0, y: 0, ...tracker.dimensions })}
      >
        <Maximize size={14} />
        Full frame
      </button>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (changed) chooseRegion(next)
          setEdit(null)
        }}
      >
        <div className="eye-number-grid eye-roi-coordinates">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label className="eye-field" key={key}>
              {REGION_FIELD_LABELS[key]} · px
              <input
                type="number"
                value={values[key]}
                step={1}
                aria-label={`ROI ${key}`}
                min={
                  key === "x" || key === "y"
                    ? 0
                    : Math.min(
                        MIN_REGION_SIZE,
                        key === "width"
                          ? tracker.dimensions.width
                          : tracker.dimensions.height
                      )
                }
                max={
                  key === "x" || key === "width"
                    ? tracker.dimensions.width
                    : tracker.dimensions.height
                }
                onChange={(event) =>
                  setEdit({
                    original: roi,
                    values: { ...values, [key]: event.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        <button
          className="eye-button secondary"
          type="submit"
          disabled={!dirty}
        >
          Apply
        </button>
      </form>
      <details className="eye-details">
        <summary>
          Editing tips
          <ChevronDown size={14} />
        </summary>
        <p className="eye-small">
          Drag inside to move, or use the handles to resize. Redraw starts a new
          box. Keep eyebrows and dark frame edges outside.
        </p>
        <p className="eye-small">
          Focus the preview and use arrow keys to move. Shift + arrows resize;
          Alt changes by 10 pixels. Escape cancels a drag.
        </p>
      </details>
    </>
  )
}
