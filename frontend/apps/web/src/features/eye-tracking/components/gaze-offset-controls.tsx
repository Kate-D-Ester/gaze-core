import { MoveHorizontal, MoveVertical, RotateCcw } from "lucide-react"
import { useState } from "react"
import {
  GazeOffsetAxisStyles,
  GazeOffsetControlsStyles,
  GazeOffsetHeadingStyles,
  GazeOffsetLabelStyles,
  GazeOffsetResetStyles,
} from "../../tracking-ui/control-styles"
import { offsetFromPixels } from "../gaze-offset"
import type { GazeOffsetAxis } from "../gaze-offset.types"
import type {
  GazeOffsetControlsProps,
  GazeOffsetEdit,
} from "./gaze-offset-controls.types"
const AXES = [
  {
    index: 0,
    label: "X",
    Icon: MoveHorizontal,
    help: "Negative moves left; positive moves right",
  },
  {
    index: 1,
    label: "Y",
    Icon: MoveVertical,
    help: "Negative moves up; positive moves down",
  },
] as const
export function GazeOffsetControls({
  offset,
  width,
  height,
  disabled = false,
  onChange,
}: GazeOffsetControlsProps) {
  const [editing, setEditing] = useState<GazeOffsetEdit | null>(null)
  const dimensions = [width, height]
  const unavailable =
    disabled ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  function changePixels(axis: GazeOffsetAxis, value: number): void {
    const next = offsetFromPixels(offset, axis, value, dimensions[axis]!)
    if (next !== offset) {
      onChange(next)
    }
  }
  return (
    <section
      className={`gaze-offset-controls ${GazeOffsetControlsStyles}`}
      aria-label="Gaze position adjustment"
    >
      <div className={`gaze-offset-heading ${GazeOffsetHeadingStyles}`}>
        <span>
          Gaze offset <small>· px</small>
        </span>
        <button
          type="button"
          className={`gaze-offset-reset ${GazeOffsetResetStyles}`}
          aria-label="Reset gaze offset"
          title="Reset gaze offset"
          data-tooltip="Reset gaze offset"
          disabled={unavailable || offset.every((value) => value === 0)}
          onClick={() => {
            setEditing(null)
            onChange([0, 0])
          }}
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
      </div>
      {AXES.map(({ index, label, Icon, help }) => {
        const dimension = dimensions[index]!
        const pixels = offset[index] * dimension
        let value = pixels.toFixed(1)
        if (editing?.axis === index) {
          value = editing.value
        }
        return (
          <div
            className={`gaze-offset-axis ${GazeOffsetAxisStyles}`}
            key={label}
          >
            <span
              className={`gaze-offset-label ${GazeOffsetLabelStyles}`}
              title={help}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </span>
            <input
              type="range"
              aria-label={`Adjust gaze ${label}`}
              aria-valuetext={`${pixels.toFixed(1)} pixels`}
              title={help}
              min={-dimension}
              max={dimension}
              step={1}
              disabled={unavailable}
              value={pixels}
              onChange={(event) => {
                setEditing(null)
                changePixels(index, event.currentTarget.valueAsNumber)
              }}
            />
            <input
              className="gaze-offset-number"
              type="number"
              aria-label={`Gaze offset ${label} (pixels)`}
              title={help}
              min={-dimension}
              max={dimension}
              step={1}
              disabled={unavailable}
              value={value}
              onFocus={(event) =>
                setEditing({ axis: index, value: event.currentTarget.value })
              }
              onInput={(event) => {
                setEditing({ axis: index, value: event.currentTarget.value })
                changePixels(index, event.currentTarget.valueAsNumber)
              }}
              onBlur={() => setEditing(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
        )
      })}
    </section>
  )
}
