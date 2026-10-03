import type { SpeakerClient } from "./client"
import type { Clip, Health, Job } from "./client.types"
import type { PlaybackController } from "./playback"
import type { ListeningMode } from "./playback.types"
import type { SelectionState } from "./selection.types"
export type ClipSessionClient = Pick<
  SpeakerClient,
  | "health"
  | "upload"
  | "clip"
  | "waitForClip"
  | "region"
  | "extract"
  | "waitForJob"
  | "cancel"
  | "remove"
  | "outputUrl"
>
export type ClipSessionPlayback = Pick<
  PlaybackController,
  "clear" | "dispose" | "listen" | "load" | "mode" | "ready" | "generation"
> &
  Partial<Pick<PlaybackController, "mount">>
export type ClipSessionOptions = {
  client: ClipSessionClient
  playback: ClipSessionPlayback
  createObjectUrl?: typeof URL.createObjectURL
  revokeObjectUrl?: typeof URL.revokeObjectURL
}
export type ClipSessionState = {
  status: "idle" | "loading" | "analysing" | "ready" | "processing" | "failed"
  sourceUrl: string | null
  filename: string
  clip: Clip | null
  job: Job | null
  health: Health | null
  selection: SelectionState
  mode: ListeningMode
  error: string
  serviceError: string
}
