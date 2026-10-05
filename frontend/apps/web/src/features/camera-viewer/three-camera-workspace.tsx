import type { SceneSession } from "../scene-eye-tracking/scene-session"
import { useLayoutEffect, useState, useSyncExternalStore } from "react"
import { EyeTrackingWorkspace } from "../../screens/eye-tracking-workspace"
import { useTracker } from "../eye-tracking/use-tracker"
import { useSceneCamera } from "../scene-eye-tracking/use-scene-camera"
import type { SceneStatus } from "../scene-eye-tracking/scene-workspace.types"
import { ViewerEyeCamera } from "./eye-camera"
import { ViewerWorkspace } from "./viewer-workspace"
import type { ViewerSessionProps } from "./three-camera-workspace.types"

export function ThreeCameraWorkspace() {
  const tracker = useTracker()
  const scene = useSceneCamera()
  const auxiliary = useSceneCamera({
    transformRole: "viewer-auxiliary",
    label: "Target camera",
  })
  return (
    <ViewerSession
      tracker={tracker}
      sceneCamera={scene.camera}
      auxiliaryCamera={auxiliary.camera}
    />
  )
}

/** Both views remain mounted so the fitted model and live calibration survive. */
export function ViewerSession({
  tracker,
  sceneCamera,
  auxiliaryCamera,
}: ViewerSessionProps) {
  const scene = useSyncExternalStore(
    sceneCamera.subscribe,
    sceneCamera.getSnapshot
  )
  const auxiliary = useSyncExternalStore(
    auxiliaryCamera.subscribe,
    auxiliaryCamera.getSnapshot
  )
  const excludedDevices = auxiliary.source?.deviceId
    ? [auxiliary.source.deviceId]
    : []
  const [gazeSession, setGazeSession] = useState<SceneSession>()
  const [setupOpen, setSetupOpen] = useState(false)
  const [eyeCamera] = useState(() => new ViewerEyeCamera(tracker))
  const [status, setStatus] = useState<SceneStatus>({
    connected: false,
    calibrated: false,
  })
  useLayoutEffect(() => {
    eyeCamera.update(tracker)
  }, [eyeCamera, tracker])
  let setupStatus = "Eye setup needed"
  if (tracker.settings.locked && tracker.source) {
    setupStatus = "Eye model ready · Calibrate scene"
    if (status.calibrated) {
      setupStatus = "Calibration estimated"
      if (status.verified) {
        setupStatus = "Calibration ready"
      } else if (status.reused) {
        setupStatus = "Calibration loaded"
      }
      if (tracker.connection !== "live" || scene.connection !== "live") {
        setupStatus = "Reconnect cameras"
      }
    }
  }
  return (
    <>
      <div hidden={setupOpen}>
        <ViewerWorkspace
          eyeCamera={eyeCamera}
          sceneCamera={sceneCamera}
          auxiliaryCamera={auxiliaryCamera}
          setupStatus={setupStatus}
          gazeSession={gazeSession}
          onSetup={() => setSetupOpen(true)}
          visible={!setupOpen}
        />
      </div>
      <div hidden={!setupOpen}>
        <EyeTrackingWorkspace
          tracker={tracker}
          sceneCamera={sceneCamera}
          sceneMode
          excludedDeviceIds={excludedDevices}
          visible={setupOpen}
          onSceneStatus={setStatus}
          onSceneSession={setGazeSession}
          onReturnToViewer={() => setSetupOpen(false)}
          returnDisabled={
            status.recording || status.capturing || tracker.busy || scene.busy
          }
        />
      </div>
    </>
  )
}
