import { useEffect, useState, useSyncExternalStore } from "react"
import { SceneCamera } from "../scene-eye-tracking/scene-camera"
import type { ViewerCameraOptions } from "./viewer-camera.types"

export function useViewerCamera(options: ViewerCameraOptions = {}) {
  const [camera] = useState(() => options.camera ?? new SceneCamera(options))
  const state = useSyncExternalStore(camera.subscribe, camera.getSnapshot)
  useEffect(() => {
    if (options.camera || !(camera instanceof SceneCamera)) {
      return
    }
    camera.mount()
    return () => camera.dispose()
  }, [camera, options.camera])
  return { camera, ...state }
}
