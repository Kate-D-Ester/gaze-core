import type { Point, Rect } from "../eye-tracking.types"
import type { TrackerController } from "../use-tracker.types"
import type { ResizeHandle } from "../roi.types"

export type EyePreviewProps = {
  tracker: TrackerController
  selectRegion: boolean
  selectCorners: boolean
  onRegion: (roi: Rect) => void
  onCorner: (point: Point) => void
  onEditRegion?: () => void
  onThresholdViewChange?: (enabled: boolean) => void
  showModel?: boolean
}

export type RegionGesture = {
  pointerId: number
  start: Point
  region: Rect
  mode: "draw" | "move" | ResizeHandle
}

export type EyePreviewHandleDefinition = {
  handle: ResizeHandle
  label: string
  x: number
  y: number
}
