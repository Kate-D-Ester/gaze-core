import { useEffect, useState, useSyncExternalStore } from "react"
import { gazeFeature } from "../eye-tracking/calibration"
import type { TrackerController } from "../eye-tracking/use-tracker.types"
import { SceneSession } from "./scene-session"
import type { SceneCamera } from "./scene-camera"
import type { HandObservation } from "./scene.types"

export function useSceneSession(
  tracker: TrackerController,
  camera: SceneCamera,
  hand: HandObservation | null,
  identity: string
) {
  const [session] = useState(() => new SceneSession())
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => {
    session.invalidate()
  }, [session, identity])
  useEffect(() => {
    const frame = tracker.frame
    if (!frame) return
    session.addEye({
      id: frame.id,
      timestamp: frame.timestamp,
      feature: frame.gaze ? gazeFeature(frame.gaze.direction) : null,
      confidence: frame.detection.ellipse?.confidence ?? 0,
      valid:
        tracker.settings.locked &&
        !!frame.gaze &&
        !!frame.detection.ellipse &&
        frame.detection.tracking !== "reacquiring" &&
        frame.detection.tracking !== "lost",
    })
  }, [session, tracker.frame, tracker.settings.locked, identity])
  useEffect(() => {
    if (hand) session.observeHand(hand, performance.now())
  }, [session, hand])
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
