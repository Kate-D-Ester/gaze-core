import { useState } from "react"
import { RotateCcw } from "lucide-react"
import type { Point } from "../eye-tracking/eye-tracking.types"

export function GazeOffsetControls({
  offset,
  width,
  height,
  disabled,
  onChange,
}: {
  offset: Point
  width: number
  height: number
  disabled: boolean
  onChange: (offset: Point) => void
}) {
  const [editing, setEditing] = useState<{
    axis: number
    value: string
  } | null>(null)
  const dimensions = [width, height]
  return (
    <div className="scene-offset-controls">
      <span title="Shift the gaze dot and saved coordinates in scene-camera pixels. Positive X moves right; positive Y moves down.">
        Offset · px
      </span>
      <div className="scene-offset-fields">
        {(["X", "Y"] as const).map((axis, index) => (
          <label className="eye-field" key={axis}>
            {axis}
            <input
              type="number"
              aria-label={`Gaze offset ${axis} (pixels)`}
              title={
                index === 0 ? "Positive moves right" : "Positive moves down"
              }
              min={-dimensions[index]!}
              max={dimensions[index]}
              step={1}
              disabled={disabled}
              value={
                editing?.axis === index
                  ? editing.value
                  : (offset[index]! * dimensions[index]!).toFixed(1)
              }
              onFocus={(event) =>
                setEditing({ axis: index, value: event.currentTarget.value })
              }
              onInput={(event) => {
                setEditing({ axis: index, value: event.currentTarget.value })
                const value = event.currentTarget.valueAsNumber
                if (!Number.isFinite(value)) return
                const next: Point = [...offset]
                next[index] = value / dimensions[index]!
                onChange(next)
              }}
              onBlur={() => setEditing(null)}
            />
          </label>
        ))}
        <button
          type="button"
          className="eye-button secondary eye-action-icon"
          aria-label="Reset gaze offset"
          data-tooltip="Reset gaze offset"
          disabled={disabled || offset.every((value) => value === 0)}
          onClick={() => {
            setEditing(null)
            onChange([0, 0])
          }}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
