import type { EyePreviewDrawingOptions } from "../eye-tracking/components/eye-preview.types"
import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
import type { SceneCameraOptions } from "../scene-eye-tracking/scene-camera.types"

export type ViewerCamera = Pick<
  SceneCamera,
  | "rawCanvas"
  | "getSnapshot"
  | "subscribe"
  | "startCamera"
  | "startNetworkStream"
  | "setTransform"
  | "stop"
> & {
  readonly canConnect?: boolean
  readonly eyePreview?: EyePreviewDrawingOptions
}
export type ViewerCameraOptions = SceneCameraOptions & { camera?: ViewerCamera }
