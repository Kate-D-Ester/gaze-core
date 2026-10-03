import { useSyncExternalStore } from "react"
import { GazeBubbleOverlay } from "../gaze-bubble/gaze-bubble-overlay"
import { canUseSceneCalibration } from "../scene-eye-tracking/scene-session"
import { getViewerGaze } from "./viewer-gaze"
import type { ViewerGazePreviewProps } from "./viewer-gaze.types"

export function ViewerGazePreview({
  session,
  camera,
  now,
}: ViewerGazePreviewProps) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const gaze = getViewerGaze(
    state,
    camera,
    Math.max(now, state.measurement?.timestamp ?? 0)
  )
  let label = "Calibrate gaze"
  if (canUseSceneCalibration(state)) {
    label = gaze.point ? "Gaze live" : "Gaze waiting"
    if (gaze.point && !gaze.verified) {
      label = "Gaze estimated"
    }
  }
  return (
    <>
      <GazeBubbleOverlay
        {...gaze}
        imageSize={camera.frame ?? undefined}
        fixed={false}
        stabilize={false}
      />
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white/80">
        {label}
      </span>
    </>
  )
}
