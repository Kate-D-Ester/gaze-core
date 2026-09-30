import { RecordingControls } from "./recording-controls"
import { useEffect } from "react"
import type { TrackerController } from "../eye-tracking/use-tracker.types"
import { V2StepPanel } from "../eye-tracking/components/v2-step-panel"
import { useSceneCamera } from "./use-scene-camera"
import { useHandTracker } from "./use-hand-tracker"
import { useSceneSession } from "./use-scene-session"
import { ScenePreview } from "./scene-preview"
import {
  FingerControls,
  SceneLiveControls,
  SceneSourceControls,
} from "./scene-controls"
import "./scene.css"
const TITLES = [
  "Connect the scene camera",
  "Calibrate with your finger",
  "Live scene gaze",
]
const NAMES = ["Scene camera", "Finger calibration", "Live scene gaze"]
export type SceneStatus = {
  connected: boolean
  calibrated: boolean
  deviceId?: string
}
export function SceneWorkspace({
  tracker,
  step,
  onStepChange,
  onStatus,
  eyeRevision,
}: {
  tracker: TrackerController
  step: number
  onStepChange: (step: number) => void
  onStatus: (status: SceneStatus) => void
  eyeRevision: number
}) {
  const scene = useSceneCamera(),
    hands = useHandTracker(scene.camera, step >= 0 && !!scene.source)
  const identity = JSON.stringify([
    eyeRevision,
    tracker.source,
    tracker.settings,
    tracker.dimensions,
    scene.source?.key,
    scene.frame?.width,
    scene.frame?.height,
  ])
  const state = useSceneSession(tracker, scene.camera, hands.hand, identity)
  useEffect(() => {
    onStatus({
      connected: !!scene.source,
      calibrated: !!state.calibration,
      deviceId: scene.source?.deviceId,
    })
  }, [onStatus, scene.source, state.calibration])
  const canCapture =
    !!scene.source &&
    tracker.settings.locked &&
    hands.status === "ready" &&
    !!tracker.frame?.gaze
  const active = Math.max(0, step)
  let handStatus = "Hand not detected"
  if (hands.hand?.landmarks.length === 1) handStatus = "One hand detected"
  else if (hands.hand?.landmarks.length) handStatus = "Show only one hand"
  const description = [
    "USB, IP camera or ESP32 mDNS stream.",
    "Collect stable holds across the scene camera view.",
    "Map gaze to camera-image coordinates and check its accuracy.",
  ][active]
  return (
    <section
      className="scene-workspace"
      hidden={step < 0}
      aria-label="Scene camera workspace"
    >
      <div className="scene-main-preview">
        <div className="scene-source-heading">
          <span className="eye-eyebrow">OUTWARD CAMERA</span>
          <span>{scene.source?.name || "Not connected"}</span>
        </div>
        <ScenePreview
          camera={scene.camera}
          frame={scene.frame}
          hand={hands.hand}
          gaze={state.measurement}
          trace={state.trace}
          holds={state.collection?.holds ?? []}
          capturing={!!state.capture}
        />
        <div className="scene-status-strip">
          <span>{scene.frame ? "Scene connected" : "Scene unavailable"}</span>
          <span>
            {tracker.frame?.gaze ? "Pupil tracked" : "Pupil unavailable"}
          </span>
          <span>{handStatus}</span>
        </div>
      </div>
      <V2StepPanel
        stepNumber={active + 4}
        stepName={NAMES[active]}
        title={TITLES[active]}
        description={description}
        error={scene.error || hands.error}
        message={state.notice}
      >
        {active === 0 && (
          <SceneSourceControls
            camera={scene.camera}
            state={scene}
            eyeDeviceId={tracker.source?.deviceId}
            onConnected={() => onStepChange(1)}
          />
        )}
        {active >= 1 && (
          <label className="eye-field">
            Scene arrival delay relative to eye (ms)
            <input
              type="number"
              min={-500}
              max={500}
              step={10}
              value={state.delayMs}
              onChange={(e) => state.session.setDelay(Number(e.target.value))}
            />
            <small>
              Positive if the scene stream arrives later. Changing this requires
              recalibration.
            </small>
          </label>
        )}
        {(active === 1 || state.capture) && (
          <FingerControls
            session={state.session}
            state={state}
            hands={hands}
            canCapture={canCapture}
            retry={hands.retry}
            onLive={() => onStepChange(2)}
          />
        )}
        {active === 2 && !state.capture && (
          <SceneLiveControls
            session={state.session}
            state={state}
            canValidate={canCapture}
            onCalibrate={() => {
              state.session.invalidate("Headset moved. Collect a new mapping.")
              onStepChange(1)
            }}
          />
        )}
        <div hidden={active !== 2}>
          <RecordingControls
            camera={scene.camera}
            tracker={tracker}
            state={state}
            hand={hands.hand}
            identity={identity}
          />
        </div>
      </V2StepPanel>
    </section>
  )
}
