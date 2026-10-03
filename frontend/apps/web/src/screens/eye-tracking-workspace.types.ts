import type { SceneSession } from "../features/scene-eye-tracking/scene-session"
import type { TrackerController } from "../features/eye-tracking/use-tracker.types"
import type { SceneCamera } from "../features/scene-eye-tracking/scene-camera"
import type { SceneStatus } from "../features/scene-eye-tracking/scene-workspace.types"
export type EyeTrackingWorkspaceProps = {
  sceneMode?: boolean
  tracker?: TrackerController
  sceneCamera?: SceneCamera
  excludedDeviceIds?: readonly string[]
  onSceneSession?: (session: SceneSession) => void
  onSceneStatus?: (status: SceneStatus) => void
  visible?: boolean
  onReturnToViewer?: () => void
  returnDisabled?: boolean
}

export type SetupStepName =
  | "Camera"
  | "Eye region"
  | "Eye model"
  | "Head tracker"
  | "Calibrate"
  | "Live gaze"

export type EyeTrackingWorkspaceContentProps = EyeTrackingWorkspaceProps & {
  tracker: TrackerController
}
