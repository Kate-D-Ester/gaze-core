import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type { CameraRole } from "./commands.types"
import type { PreviewPoint, VisualSelection } from "./selection.types"
export type ViewerSourceKind = "camera" | "network"
export type CameraPanelProps = {
  role: CameraRole
  label: string
  camera: SceneCamera
  state: SceneCameraSnapshot
  active: boolean
  connectionPending: boolean
  excludedDevices: readonly string[]
  selection: VisualSelection | null
  onActivate: () => void
  onConnect: (kind: ViewerSourceKind, value: string) => void
  onDisconnect: () => void
  onPoint: (point: PreviewPoint) => void
}
