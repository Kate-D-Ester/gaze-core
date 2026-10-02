import type {
  Landmark,
  SceneObservation,
} from "../src/features/scene-eye-tracking/scene.types"

export type ReplayReply = {
  type: string
  error?: string
  delegate?: string
  inferenceMs?: number
  landmarks: Landmark[][]
  worldLandmarks: Landmark[][]
  scene: SceneObservation
  handedness: string[]
}
