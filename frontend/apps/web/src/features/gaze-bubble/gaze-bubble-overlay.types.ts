import type { Point } from "../eye-tracking/eye-tracking.types"
import type { GazeImageSize } from "./gaze-bubble.types"

export type GazeBubbleOverlayProps = {
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
}
