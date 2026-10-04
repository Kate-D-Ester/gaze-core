import type { Box, FaceTrack } from "./client.types"
import type { SceneObservation } from "../scene-eye-tracking/scene.types"
export type FacePreviewSnapshot = {
  status: "idle" | "loading" | "ready" | "error"
  tracks: FaceTrack[]
  error: string
}
export type FacePreviewRequest =
  | { type: "init"; generation: number }
  | {
      type: "frame"
      generation: number
      scene: SceneObservation
      bitmap: ImageBitmap
      region: Box | null
      revision: number
    }
export type FacePreviewReply =
  | { type: "ready"; generation: number }
  | { type: "error"; generation: number; error: string }
  | {
      type: "faces"
      generation: number
      scene: SceneObservation
      boxes: Box[]
      revision: number
    }
