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
