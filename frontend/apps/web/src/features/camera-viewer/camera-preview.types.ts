import type { ObjectBox, ObjectTrackingSnapshot } from "./object-tracking.types"
import type { SceneSession } from "../scene-eye-tracking/scene-session"
import type { ViewerCamera } from "./viewer-camera.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type { PreviewPoint, VisualSelection } from "./selection.types"
export type CameraPreviewProps = {
  tracking?: ObjectTrackingSnapshot
  trackingRole?: "scene" | "auxiliary"
  region?: ObjectBox | null
  onRegion?: (box: ObjectBox) => void
  now?: number
  gazeSession?: SceneSession
  label: string
  camera: ViewerCamera
  state: SceneCameraSnapshot
  selection: VisualSelection | null
  onPoint?: (point: PreviewPoint) => void
}
