import type { VoiceSessionFactory } from "./local-voice.types"
import type { SceneSession } from "../scene-eye-tracking/scene-session"
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

import type { ObjectTracking } from "./object-tracking"
export type ViewerWorkspaceProps = {
  objectTracking?: ObjectTracking
  voiceSessionFactory?: VoiceSessionFactory
  gazeSession?: SceneSession
  eyeCamera?: ViewerCamera
  sceneCamera?: ViewerCamera
  auxiliaryCamera?: ViewerCamera
  onSetup?: () => void
  setupStatus?: string
  visible?: boolean
}
