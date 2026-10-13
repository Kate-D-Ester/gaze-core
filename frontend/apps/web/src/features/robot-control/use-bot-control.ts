import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { ObjectTracking } from "../camera-viewer/object-tracking"
import type { ViewerCamera } from "../camera-viewer/viewer-camera.types"
import { ZeroSession } from "./zero-session"
import { TargetFollower } from "./target-follower"

export function useBotControl(
  tracking: ObjectTracking,
  scene: ViewerCamera,
  target: ViewerCamera,
  visible: boolean,
  supplied?: ZeroSession
) {
  const [session] = useState(() => supplied ?? new ZeroSession())
  const follower = useMemo(
    () => new TargetFollower(session, tracking, scene, target),
    [session, tracking, scene, target]
  )
  const robot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const following = useSyncExternalStore(
    follower.subscribe,
    follower.getSnapshot
  )
  const tracked = useSyncExternalStore(tracking.subscribe, tracking.getSnapshot)
  const targetState = useSyncExternalStore(target.subscribe, target.getSnapshot)
  useEffect(() => {
    const check = () => {
      if (visible && !document.hidden) {
        follower.tick()
      } else if (follower.getSnapshot().enabled) {
        follower.disable()
      }
    }
    const stop = () => follower.disable()
    const unsubscribe = [
      session.subscribe(check),
      tracking.subscribe(check),
      scene.subscribe(check),
      target.subscribe(check),
    ]
    const timer = setInterval(check, 50)
    window.addEventListener("blur", stop)
    window.addEventListener("pagehide", stop)
    document.addEventListener("visibilitychange", check)
    check()
    return () => {
      clearInterval(timer)
      unsubscribe.forEach((fn) => fn())
      window.removeEventListener("blur", stop)
      window.removeEventListener("pagehide", stop)
      document.removeEventListener("visibilitychange", check)
      follower.disable()
    }
  }, [session, follower, tracking, scene, target, visible])
  useEffect(
    () => () => {
      void session.disconnect()
    },
    [session]
  )
  return { session, follower, robot, following, tracked, targetState }
}
