import type { GazeMeasurement } from "../scene-eye-tracking/scene.types"
import type { SelectionBubble } from "./bubble-selection.types"
import type { z } from "zod"
import type { SceneSpeakerPanelProps } from "./scene-panel.types"
import type { FaceTrack } from "./client.types"
import type { ListeningMode } from "./playback.types"
import type { SelectionState } from "./selection.types"
import type { liveReplySchema } from "./live-schema"
export type LiveReply = z.infer<typeof liveReplySchema>
export type LiveState = {
  status: "idle" | "starting" | "live" | "failed"
  mode: ListeningMode
  tracks: FaceTrack[]
  selection: SelectionState
  device: string
  inferenceSeconds: number | null
  arrivalDelay: number | null
  error: string
}
export type LiveEvidence = SceneSpeakerPanelProps

export type DisplayedGaze = {
  measurement: GazeMeasurement
  bubble: SelectionBubble
}
