import { useEffect, useState, useSyncExternalStore } from "react"
import { SpeakerClient } from "./client"
import { ClipSession } from "./clip-session"
import { PlaybackController } from "./playback"

export function useSpeakerFocus() {
  const [session] = useState(() => {
    const video = document.createElement("video")
    video.controls = true
    video.playsInline = true
    video.preload = "metadata"
    video.className = "block h-full w-full object-contain"
    video.setAttribute("aria-label", "Conversation reference video")
    const playback = new PlaybackController(video, {
      onError: (message) => session.reportError(message),
    })
    const session = new ClipSession(video, {
      client: new SpeakerClient(),
      playback,
    })
    return session
  })
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => {
    session.mount()
    void session.connect()
    const timer = setInterval(() => {
      void session.connect()
    }, 3000)
    return () => {
      clearInterval(timer)
      session.dispose()
    }
  }, [session])
  return { session, state }
}
