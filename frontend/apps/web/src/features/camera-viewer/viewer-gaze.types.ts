import type { GazeBubbleOverlayProps } from "../gaze-bubble/gaze-bubble-overlay.types"
import type { SceneSession } from "../scene-eye-tracking/scene-session"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
export type ViewerGazeDisplay = Pick<
  GazeBubbleOverlayProps,
  | "point"
  | "timestamp"
  | "verified"
  | "errorRadiusPx"
  | "resetKey"
  | "offset"
  | "maxAgeMs"
>
export type ViewerGazePreviewProps = {
  now: number
  session: SceneSession
  camera: SceneCameraSnapshot
}
