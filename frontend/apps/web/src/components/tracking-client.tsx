"use client"
import dynamic from "next/dynamic"
import type { TrackingClientProps } from "./tracking-client.types"
function LoadingTracker() {
  return (
    <main
      className="grid min-h-svh place-items-center bg-[#090b09] text-sm text-[#a8d8c6]"
      role="status"
    >
      Loading tracker…
    </main>
  )
}
const EyeTrackingWorkspace = dynamic(
  () =>
    import("@/screens/eye-tracking-workspace").then(
      (module) => module.EyeTrackingWorkspace
    ),
  { ssr: false, loading: LoadingTracker }
)
const RemoteEyeTracking = dynamic(
  () =>
    import("@/screens/remote-eye-tracking-page").then(
      (module) => module.RemoteEyeTrackingPage
    ),
  { ssr: false, loading: LoadingTracker }
)
const CameraViewer = dynamic(
  () =>
    import("@/features/camera-viewer/three-camera-workspace").then(
      (module) => module.ThreeCameraWorkspace
    ),
  { ssr: false, loading: LoadingTracker }
)
export function TrackingClient({ mode }: TrackingClientProps) {
  if (mode === "viewer") {
    return <CameraViewer />
  }
  if (mode === "remote") {
    return <RemoteEyeTracking />
  }
  return <EyeTrackingWorkspace key={mode} sceneMode={mode === "scene"} />
}
