import type { ObjectBox, ObjectTrackingSnapshot } from "./object-tracking.types"
import type { SceneSession } from "../scene-eye-tracking/scene-session"
import type { ViewerCamera } from "./viewer-camera.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type { CameraRole } from "./commands.types"
import type { PreviewPoint, VisualSelection } from "./selection.types"
export type ViewerSourceKind = "camera" | "network"
export type CameraPanelProps = {
  tracking?: ObjectTrackingSnapshot
  trackingRole?: "scene" | "auxiliary"
  region?: ObjectBox | null
  onRegion?: (box: ObjectBox) => void
  now?: number
  gazeSession?: SceneSession
  role: CameraRole
  label: string
  camera: ViewerCamera
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
