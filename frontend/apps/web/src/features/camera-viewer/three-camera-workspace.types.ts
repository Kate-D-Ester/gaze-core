import type { TrackerController } from "../eye-tracking/use-tracker.types"
import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
export type ViewerSessionProps = {
  tracker: TrackerController
  sceneCamera: SceneCamera
  auxiliaryCamera: SceneCamera
}
