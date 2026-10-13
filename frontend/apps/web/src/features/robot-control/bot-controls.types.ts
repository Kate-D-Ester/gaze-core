import type { ObjectTracking } from "../camera-viewer/object-tracking"
import type { ViewerCamera } from "../camera-viewer/viewer-camera.types"
import type { ZeroSession } from "./zero-session"
export type BotControlsProps = {
  tracking: ObjectTracking
  scene: ViewerCamera
  target: ViewerCamera
  visible?: boolean
  session?: ZeroSession
}
