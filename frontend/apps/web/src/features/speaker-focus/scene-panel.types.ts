import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
import type {
  GazeMeasurement,
  SceneObservation,
} from "../scene-eye-tracking/scene.types"
import type { SceneSource } from "../scene-eye-tracking/scene-camera.types"
export type SceneSpeakerPanelProps = {
  camera: SceneCamera
  frame: SceneObservation | null
  measurement: GazeMeasurement | null
  verified: boolean
  identity: string
  source: SceneSource | null
}
