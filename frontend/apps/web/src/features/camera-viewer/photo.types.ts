import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
export type PhotoCamera = {
  rawCanvas: HTMLCanvasElement
  getSnapshot: () => SceneCameraSnapshot
}
