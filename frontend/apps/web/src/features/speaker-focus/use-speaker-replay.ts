import { useEffect, useState, useSyncExternalStore } from "react"
import { ReplayController } from "./replay-controller"
export function useSpeakerReplay() {
  const [controller] = useState(() => new ReplayController())
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  )
  useEffect(() => {
    controller.mount()
    return () => controller.dispose()
  }, [controller])
  return { controller, state }
}
