import type { Point } from "./eye-tracking.types"
import type { HeadTrackingController } from "./head-tracking/use-head-tracking.types"

export type LiveGazeOverlayProps = {
  point: Point | null
  title: string
  simulated: boolean
  head: HeadTrackingController
  onClose: () => void
}
