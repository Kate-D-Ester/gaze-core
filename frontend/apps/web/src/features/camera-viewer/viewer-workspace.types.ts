import type { ViewerCamera } from "./viewer-camera.types"
import type { CameraRole } from "./commands.types"
import type { VisualSelections } from "./selection.types"
export type ViewerCameras = Record<CameraRole, ViewerCamera>
export type ViewerSelections = VisualSelections
export type ConnectionGuard = {
  busy: boolean
  generation: number
  role: CameraRole | null
}

export type ViewerWorkspaceProps = {
  eyeCamera?: ViewerCamera
  sceneCamera?: ViewerCamera
  auxiliaryCamera?: ViewerCamera
  onSetup?: () => void
  setupStatus?: string
  visible?: boolean
}
