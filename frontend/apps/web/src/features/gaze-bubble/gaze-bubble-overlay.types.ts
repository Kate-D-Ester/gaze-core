import type { Point } from "../eye-tracking/eye-tracking.types"
import type { MutableRefObject } from "react"
import type {
  GazeBubbleState,
  GazeImageSize,
  GazeView,
} from "./gaze-bubble.types"

export type GazeBubbleOverlaySnapshot = {
  bubble: GazeBubbleState
  view: GazeView
}

export type GazeBubbleOverlayProps = {
  point: Point | null
  timestamp: number | null
  errorRadiusPx?: number | null
  verified?: boolean
  resetKey?: unknown
  offset?: Point
  fixed?: boolean
  stabilize?: boolean
  /** Disable motion when consumers select targets using the rendered geometry. */
  animate?: boolean
  maxAgeMs?: number
  /** Native image dimensions; errorRadiusPx is then in native image pixels. */
  imageSize?: GazeImageSize
  markerClassName?: string
  snapshotRef?: MutableRefObject<GazeBubbleOverlaySnapshot | null>
  onSnapshot?: (snapshot: GazeBubbleOverlaySnapshot | null) => void
}
