import type {
  GazeMeasurement,
  SceneObservation,
} from "../scene-eye-tracking/scene.types"
import type { FaceTrack } from "./client.types"
export type SceneSelectionInput = {
  identity: string
  frame: SceneObservation | null
  measurement: GazeMeasurement | null
  verified: boolean
  tracks: readonly FaceTrack[]
  now: number
}
