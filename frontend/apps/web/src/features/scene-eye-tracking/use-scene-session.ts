import { useEffect, useState, useSyncExternalStore } from "react"
import type { TrackerController } from "../eye-tracking/use-tracker.types"
import { SceneSession } from "./scene-session"
import type { SceneCamera } from "./scene-camera"
import { sceneEyeEvidence } from "./eye-evidence"
import { readCalibrationMethod } from "./calibration-preferences"

export function useSceneSession(
  tracker: TrackerController,
  camera: SceneCamera,
  identity: string
) {
  const [session] = useState(() => new SceneSession(readCalibrationMethod()))
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => {
    session.setCameraOrientation({
      eye: tracker.transform,
      scene: camera.getSnapshot().transform,
    })
    session.invalidate()
  }, [session, identity, tracker.transform, camera])
  useEffect(() => {
    const frame = tracker.frame
    if (!frame) return
    const now = performance.now()
    const { observation } = sceneEyeEvidence(
      frame,
      tracker.settings.locked,
      now
    )
    if (observation) session.addEye(observation, now)
  }, [session, tracker.frame, tracker.settings.locked, identity])
  useEffect(() => {
    const measure = () => {
      const now = performance.now()
      session.measure(camera.latest, now)
      session.checkCaptureFreshness(now)
    }
    const unsubscribe = camera.subscribe(measure),
      timer = setInterval(measure, 100)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [camera, session])
  return { session, ...state }
}
