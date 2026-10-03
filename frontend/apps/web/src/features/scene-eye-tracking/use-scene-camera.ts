import { useEffect, useState, useSyncExternalStore } from "react"
import { SceneCamera } from "./scene-camera"
import type { UseSceneCameraOptions } from "./use-scene-camera.types"
export function useSceneCamera(options: UseSceneCameraOptions = {}) {
  const [camera] = useState(() => options.camera ?? new SceneCamera(options))
  const state = useSyncExternalStore(camera.subscribe, camera.getSnapshot)
  useEffect(() => {
    if (options.camera) {
      return
    }
    camera.mount()
    return () => camera.dispose()
  }, [camera, options.camera])
  return { camera, ...state }
}
