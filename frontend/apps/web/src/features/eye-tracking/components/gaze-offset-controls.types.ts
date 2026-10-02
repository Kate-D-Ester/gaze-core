import type { Point } from "../eye-tracking.types"
import type { GazeOffsetAxis } from "../gaze-offset.types"

export type GazeOffsetControlsProps = {
  offset: Point
  width: number
  height: number
  disabled?: boolean
  onChange: (offset: Point) => void
}

export type GazeOffsetEdit = {
  axis: GazeOffsetAxis
  value: string
}
