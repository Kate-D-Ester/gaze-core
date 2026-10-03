import { useEffect, useState, useSyncExternalStore } from "react"
import { SceneCamera } from "./scene-camera"
import type { SceneCameraOptions } from "./scene-camera.types"
export function useSceneCamera(options: SceneCameraOptions = {}) {
  const [camera] = useState(() => new SceneCamera(options))
  const state = useSyncExternalStore(camera.subscribe, camera.getSnapshot)
  useEffect(() => {
    camera.mount()
    return () => camera.dispose()
  }, [camera])
  return { camera, ...state }
}
