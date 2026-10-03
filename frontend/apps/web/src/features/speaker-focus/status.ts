import type { ClipSessionState } from "./clip-session.types"
export function listeningStatus(
  state: ClipSessionState,
  done: boolean,
  progress: number
): string {
  if (state.status === "processing") {
    return `Preparing voice · ${progress}% · original audio stays available`
  }
  if (state.status === "analysing") {
    return "Analysing visible faces…"
  }
  if (state.mode === "focused" && !done) {
    return "Focused audio is paused until a selected voice is ready."
  }
  if (state.mode === "focused") {
    return "Computed target audio is ready. Use the video controls to play or seek."
  }
  if (done) {
    return "Original conversation audio. The selected voice is also ready for comparison."
  }
  return "Original conversation audio. Choose a visible person to extract their voice."
}

import type { ReplayState } from "./replay-controller.types"
export function streamingStatus(state: ReplayState): string {
  if (state.status === "loading") {
    return "Loading video…"
  }
  if (!state.media) {
    return "Choose the debate reference or a local video."
  }
  if (state.status === "ended") {
    return "Playback finished"
  }
  if (state.status === "paused" || state.status === "ready") {
    return "Paused · select a face, then press Play"
  }
  if (state.mode === "focused" && !state.selectedId) {
    return "Select a face to listen"
  }
  const listening = state.mode === "original" ? "Original" : "Focused"
  if (state.timing?.state !== "playing") {
    return `Buffering · ${listening}`
  }
  return `${listening} · ${state.timing.delaySeconds?.toFixed(1) ?? "—"} s delay`
}
