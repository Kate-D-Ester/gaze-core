import type { GazeCorrectionOptions } from "../gaze-correction/gaze-correction.types"
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
  correction?: GazeCorrectionOptions
  point: Point | null
  timestamp: number | null
  errorRadiusPx?: number | null
  verified?: boolean
  resetKey?: unknown
  offset?: Point
  fixed?: boolean
  stabilize?: boolean
  maxAgeMs?: number
  /** Native image dimensions; errorRadiusPx is then in native image pixels. */
  imageSize?: GazeImageSize
  markerClassName?: string
  snapshotRef?: MutableRefObject<GazeBubbleOverlaySnapshot | null>
}
