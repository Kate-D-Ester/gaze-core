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
> & { readonly canConnect?: boolean }
export type ViewerCameraOptions = SceneCameraOptions & { camera?: ViewerCamera }
