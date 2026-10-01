import { useCallback, useEffect, useRef, useState } from "react"
import { RemoteSession, type SessionState } from "./session"
import type { RemoteMode, RemoteSettings } from "./types"

export function useRemoteTracker(
  settings: RemoteSettings,
  onInterruption?: () => void
) {
  const interruption = useRef(onInterruption)
  useEffect(() => {
    interruption.current = onInterruption
  }, [onInterruption])
  const videoRef = useRef<HTMLVideoElement>(null)
  const sessionRef = useRef<RemoteSession | null>(null)
  const latest = useRef<SessionState["observation"]>(null)
  const [state, setState] = useState<SessionState>({
    status: "idle",
    error: "",
    devices: [],
    cameraAccess: "idle",
    cameraError: "",
    observation: null,
    fps: 0,
  })
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let previousStatus: SessionState["status"] = "idle"
    const session = new RemoteSession(video, (value) => {
      latest.current = value.observation
      if (
        value.status === "error" ||
        (value.status === "idle" && previousStatus !== "idle")
      )
        interruption.current?.()
      previousStatus = value.status
      setState(value)
    })
    sessionRef.current = session
    const hide = () => {
      if (document.hidden) session.stop()
    }
    document.addEventListener("visibilitychange", hide)
    return () => {
      document.removeEventListener("visibilitychange", hide)
      session.dispose()
      sessionRef.current = null
    }
  }, [])
  useEffect(() => {
    sessionRef.current?.setSettings(settings)
  }, [settings])
  const start = useCallback(
    (mode: RemoteMode, deviceId?: string) =>
      sessionRef.current?.start(mode, deviceId),
    []
  )
  const stop = useCallback(() => sessionRef.current?.stop(), [])
  const requestCameraAccess = useCallback(
    () => sessionRef.current?.requestCameraAccess(),
    []
  )
  const refreshDevices = useCallback(
    () => sessionRef.current?.refreshDevices(),
    []
  )
  return {
    state,
    videoRef,
    latest,
    start,
    stop,
    requestCameraAccess,
    refreshDevices,
  }
}
