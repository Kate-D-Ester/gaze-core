import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
import type { CameraRole } from "./commands.types"
import type { VisualSelections } from "./selection.types"
export type ViewerCameras = Record<CameraRole, SceneCamera>
export type ViewerSelections = VisualSelections
export type ConnectionGuard = {
  busy: boolean
  generation: number
  role: CameraRole | null
}
