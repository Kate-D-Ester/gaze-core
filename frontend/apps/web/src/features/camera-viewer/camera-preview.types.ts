import type { ViewerCamera } from "./viewer-camera.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type { PreviewPoint, VisualSelection } from "./selection.types"
export type CameraPreviewProps = {
  label: string
  camera: ViewerCamera
  state: SceneCameraSnapshot
  selection: VisualSelection | null
  onPoint: (point: PreviewPoint) => void
}
