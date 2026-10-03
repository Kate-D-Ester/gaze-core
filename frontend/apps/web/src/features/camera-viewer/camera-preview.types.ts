import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type { PreviewPoint, VisualSelection } from "./selection.types"
export type CameraPreviewProps = {
  label: string
  camera: SceneCamera
  state: SceneCameraSnapshot
  selection: VisualSelection | null
  onPoint: (point: PreviewPoint) => void
}
