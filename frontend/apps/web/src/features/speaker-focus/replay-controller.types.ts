import type { FaceTrack, Health } from "./client.types"
import type { PlaybackTiming } from "./live-player.types"
import type { ListeningMode } from "./playback.types"
import type { ReplayMedia } from "./replay-source.types"
import type { ImagePoint } from "./selection.types"
export type ReplayState = {
  status:
    "empty" | "loading" | "ready" | "playing" | "paused" | "ended" | "failed"
  mode: ListeningMode
  media: ReplayMedia | null
  label: string
  tracks: FaceTrack[]
  selectedId: string | null
  sourceSample: number
  displayedSample: number | null
  timing: PlaybackTiming | null
  health: Health | null
  serviceError: string
  error: string
}

export type ReplaySelectionOptions = {
  sourceSample: number
  radius?: ImagePoint
}
