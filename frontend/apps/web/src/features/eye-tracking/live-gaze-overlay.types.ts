import type { Point } from "./eye-tracking.types"
import type { HeadTrackingController } from "./head-tracking/use-head-tracking.types"

export type LiveGazeOverlayProps = {
  point: Point | null
  timestamp: number | null
  validationErrorPixels: number | null
  resetKey?: unknown
  offset?: Point
  title: string
  simulated: boolean
  head: HeadTrackingController
  onClose: () => void
}
