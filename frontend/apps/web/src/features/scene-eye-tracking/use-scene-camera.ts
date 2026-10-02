import { useEffect, useState, useSyncExternalStore } from "react"
import { SceneCamera } from "./scene-camera"

export function useSceneCamera() {
  const [camera] = useState(() => new SceneCamera())
  const state = useSyncExternalStore(camera.subscribe, camera.getSnapshot)
  useEffect(() => {
    camera.mount()
    return () => camera.dispose()
  }, [camera])
  return { camera, ...state }
}
