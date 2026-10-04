import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
import type {
  GazeMeasurement,
  SceneObservation,
} from "../scene-eye-tracking/scene.types"
import type {
  SceneCameraSnapshot,
  SceneSource,
} from "../scene-eye-tracking/scene-camera.types"
export type SceneSpeakerPanelProps = {
  camera: SceneCamera
  frame: SceneObservation | null
  measurement: GazeMeasurement | null
  verified: boolean
  allowUnverifiedGaze?: boolean
  errorRadiusPx?: number | null
  identity: string
  source: SceneSource | null
  connection?: SceneCameraSnapshot["connection"]
  cameraError?: string
  guided?: boolean
  active?: boolean
}
