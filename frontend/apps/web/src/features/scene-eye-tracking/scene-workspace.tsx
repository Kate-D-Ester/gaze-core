import { CircleDot, Clock3, Eye, Hand, Wifi } from "lucide-react"
import { useEffect, useState } from "react"
import { CameraTransformControls } from "../eye-tracking/components/camera-transform-controls"
import { SetupStepPanel } from "../eye-tracking/components/setup-step-panel"
import { NETWORK_CONNECTION_LABELS } from "../eye-tracking/network-camera"
import { EyeFieldStyles } from "../tracking-ui/control-styles"
import {
  SceneDelaySettingsStyles,
  SceneMainPreviewStyles,
  SceneSourceHeadingStyles,
  SceneSourceTitleStyles,
  SceneStatusStripStyles,
  SceneWorkspaceStyles,
} from "../tracking-ui/scene-styles"
import { StatusLightStyles } from "../tracking-ui/layout-styles"
import { MAX_FRAME_AGE_MS, MAX_HAND_RECOVERY_MS } from "./calibration"
import { CalibrationEyePreview } from "./calibration-eye-preview"
import { CalibrationProfileControls } from "./calibration-profile-controls"
import { sceneEyeEvidence } from "./eye-evidence"
import { RecordingControls } from "./recording-controls"
import {
  FingerControls,
  SceneLiveControls,
  SceneSourceControls,
} from "./scene-controls"
import { ScenePreview } from "./scene-preview"
import {
  canUseSceneCalibration,
  hasCurrentAccuracyCheck,
} from "./scene-session"
import type { SceneWorkspaceProps } from "./scene-workspace.types"
import { ScreenCalibrationMarker } from "./screen-calibration-marker"
import { useCalibrationProfiles } from "./use-calibration-profiles"
import { useHandTracker } from "./use-hand-tracker"
import { useMarkerTracker } from "./use-marker-tracker"
import { useSceneCamera } from "./use-scene-camera"
import { useSceneSession } from "./use-scene-session"
export type { SceneStatus } from "./scene-workspace.types"
const NAMES = ["Scene camera", "Calibration", "Live scene gaze"]
export function SceneWorkspace({
  tracker,
  step,
  onStepChange,
  onStatus,
  eyeRevision,
}: SceneWorkspaceProps) {
  const [recording, setRecording] = useState(false)
  const [eyeClock, setEyeClock] = useState(0)
  useEffect(() => {
    if (step < 0) {
      return
    }
    const tick = () => setEyeClock(performance.now())
    tick()
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [step])
  const scene = useSceneCamera()
  const identity = JSON.stringify([
    eyeRevision,
    tracker.source,
    tracker.settings,
    tracker.dimensions,
    tracker.transform,
    scene.transform,
    scene.source?.key,
    scene.frame?.width,
    scene.frame?.height,
  ])
  const state = useSceneSession(tracker, scene.camera, identity)
  const profiles = useCalibrationProfiles({
    session: state.session,
    state,
    setup: {
      trackerFormat: tracker.settings.format,
      orientation: { eye: tracker.transform, scene: scene.transform },
    },
    ready:
      step >= 1 &&
      scene.connection === "live" &&
      !!scene.frame &&
      tracker.settings.locked,
    disabled: recording || !!state.capture,
    onLoaded: () => onStepChange(2),
  })
  const isMarker = state.method === "marker"
  const hands = useHandTracker(
    scene.camera,
    step >= 0 && !!scene.source && !isMarker
  )
  const markers = useMarkerTracker(
    scene.camera,
    step >= 0 && !!scene.source && isMarker
  )
  const referenceTracker = isMarker ? markers : hands
  useEffect(() => {
    if (isMarker && markers.marker) {
      state.session.observeReference(
        { ...markers.marker, kind: "marker" },
        performance.now()
      )
    } else if (!isMarker && hands.hand) {
      state.session.observeHand(hands.hand, performance.now())
    }
  }, [hands.hand, isMarker, markers.marker, state.session])
  const calibrated = canUseSceneCalibration(state)
  useEffect(() => {
    onStatus({
      connected: !!scene.source,
      calibrated,
      deviceId: scene.source?.deviceId,
      recording,
    })
  }, [onStatus, recording, scene.source, calibrated])
  const canCapture =
    !!scene.source &&
    scene.connection === "live" &&
    tracker.settings.locked &&
    referenceTracker.status === "ready" &&
    !!tracker.frame?.gaze
  const active = Math.max(0, step)
  const showEye = step >= 0 && (active === 1 || !!state.capture)
  const eyeEvidence = sceneEyeEvidence(
    tracker.frame,
    tracker.settings.locked,
    Math.max(eyeClock, tracker.frame?.timestamp ?? 0)
  )
  const displayHand =
    !isMarker &&
    hands.previewHand &&
    scene.frame &&
    scene.frame.generation === hands.previewHand.scene.generation &&
    scene.frame.timestamp - hands.previewHand.scene.timestamp <=
      MAX_HAND_RECOVERY_MS
      ? hands.previewHand
      : null
  const handRecovering =
    !!displayHand &&
    (hands.hand?.landmarks.length !== 1 ||
      displayHand.scene.id !== hands.hand.scene.id)
  let handStatus = "Hand not detected"
  if (hands.hand?.landmarks.length === 1) {
    handStatus = "One hand detected"
  } else if (handRecovering) {
    handStatus = "Reacquiring hand"
  } else if (hands.hand?.landmarks.length) {
    handStatus = "Show only one hand"
  }
  const handDetails = [
    handStatus,
    hands.delegate,
    hands.inferenceMs === null
      ? null
      : `${Math.round(hands.inferenceMs)} ms inference`,
  ]
    .filter(Boolean)
    .join(" · ")
  const markerDetectionHint = markers.marker?.position
    ? "Marker detected"
    : "Show the center marker in the scene camera"
  const targetDetails = isMarker
    ? (markers.marker?.reason ?? markerDetectionHint)
    : handDetails
  const TargetIcon = isMarker ? CircleDot : Hand
  let calibrationDescription =
    "Place one hand in the ring with your palm and index finger visible. Look at your physical fingertip, press Space to lock, then hold steady. Brief tracking losses pause collection. Keep a consistent working distance and recalibrate after headset movement."
  if (isMarker) {
    calibrationDescription =
      "Aim the scene camera at this page's center marker. Look continuously at its red center, slowly move your head and pause for each tone. This one marker supplies nine camera-image positions, then five fresh accuracy checks. Use your normal working distance; reduce screen brightness if there is glare."
  } else if (state.method === "one-point") {
    calibrationDescription =
      "Look at your physical fingertip and press Space once. A prior verified mapping is reused when available; otherwise camera alignment is estimated. Adjust X/Y gain and offset in live view. One point cannot measure full-view accuracy."
  }
  const description = [
    "Choose USB or a network stream. Mount both cameras together and keep them fixed relative to your eye.",
    calibrationDescription,
    "Map gaze to camera-image coordinates and check its accuracy.",
  ][active]
  const targetReady = isMarker
    ? !!markers.marker?.position
    : displayHand?.landmarks.length === 1
  return (
    <section
      className={[
        `scene-workspace ${SceneWorkspaceStyles}`,
        showEye && "with-eye-preview",
        showEye && isMarker && "with-screen-marker",
      ]
        .filter(Boolean)
        .join(" ")}
      hidden={step < 0}
      aria-label="Scene camera workspace"
    >
      <div
        className={`scene-main-preview scene-camera-preview ${SceneMainPreviewStyles}`}
      >
        <div className={`scene-source-heading ${SceneSourceHeadingStyles}`}>
          <div className={`scene-source-title ${SceneSourceTitleStyles}`}>
            <span
              className={
                scene.connection === "live"
                  ? `status-light ${StatusLightStyles} on`
                  : `status-light ${StatusLightStyles}`
              }
            />
            <span>Scene camera</span>
          </div>
          <CameraTransformControls
            label="Scene camera"
            value={scene.transform}
            disabled={recording || !!state.capture}
            onChange={scene.camera.setTransform}
          />
        </div>
        <ScenePreview
          camera={scene.camera}
          frame={scene.frame}
          hand={displayHand}
          handRecovering={handRecovering}
          marker={isMarker ? markers.marker : null}
          hideMarkerPattern={isMarker && showEye}
          method={state.method}
          gaze={state.measurement}
          gazeDisplay={{
            errorRadiusPx: state.offset.every(
              (value, index) =>
                value === (state.validation?.offset?.[index] ?? 0)
            )
              ? (state.validation?.pixelRms ?? null)
              : null,
            verified: hasCurrentAccuracyCheck(state),
            resetKey: state.calibration,
            offset: state.offset,
            maxAgeMs: MAX_FRAME_AGE_MS + Math.abs(state.delayMs),
          }}
          trace={state.trace}
          holds={state.collection?.holds ?? []}
          capturing={!!state.capture}
          target={
            state.capture &&
            (state.method !== "one-point" || state.capture === "validation")
              ? (state.collection?.target ?? null)
              : null
          }
          progress={state.collection?.progress ?? 0}
          connection={scene.connection}
        />
        <div className={`scene-status-strip ${SceneStatusStripStyles}`}>
          <span
            title={NETWORK_CONNECTION_LABELS[scene.connection]}
            aria-label={NETWORK_CONNECTION_LABELS[scene.connection]}
          >
            <Wifi size={15} aria-hidden="true" />
            {NETWORK_CONNECTION_LABELS[scene.connection]}
            {scene.connection === "reconnecting"
              ? " · Attempt " + scene.retryAttempt
              : ""}
          </span>
          <span
            className={
              eyeEvidence.ready ? "scene-indicator ready" : "scene-indicator"
            }
            title={eyeEvidence.hint}
            aria-label={eyeEvidence.hint}
          >
            <Eye size={16} aria-hidden="true" />
          </span>
          <span
            className={[
              "scene-indicator",
              targetReady ? "ready" : "",
              handRecovering ? "recovering" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={targetDetails}
            aria-label={targetDetails}
          >
            <TargetIcon size={16} aria-hidden="true" />
          </span>
        </div>
      </div>
      {showEye && (
        <CalibrationEyePreview tracker={tracker} evidence={eyeEvidence} />
      )}
      <SetupStepPanel
        stepName={NAMES[active]}
        description={description}
        error={scene.error || referenceTracker.error}
        message={
          state.validation && !state.validation.passed ? "" : state.notice
        }
        stage={
          isMarker && showEye ? (
            <ScreenCalibrationMarker capturing={!!state.capture} />
          ) : undefined
        }
      >
        {active >= 1 && <CalibrationProfileControls controller={profiles} />}
        {active === 0 && (
          <SceneSourceControls
            camera={scene.camera}
            state={scene}
            eyeDeviceId={tracker.source?.deviceId}
            onConnected={() => onStepChange(1)}
            active={step === 0 && tracker.settings.locked}
          />
        )}
        {(active === 1 || state.capture) && (
          <FingerControls
            session={state.session}
            state={state}
            hands={referenceTracker}
            canCapture={canCapture}
            retry={referenceTracker.retry}
            onLive={() => onStepChange(2)}
          />
        )}
        {active === 2 && !state.capture && (
          <SceneLiveControls
            session={state.session}
            state={state}
            sceneDimensions={scene.frame ?? undefined}
            canValidate={canCapture}
            recording={recording}
            onMethodChange={(method) => {
              state.session.setMethod(method)
              onStepChange(1)
            }}
            onCalibrate={() => {
              state.session.invalidate("Headset moved. Collect a new mapping.")
              onStepChange(1)
            }}
          />
        )}
        {active >= 1 && (
          <details
            className={`scene-delay-settings ${SceneDelaySettingsStyles}`}
          >
            <summary title="Adjust timing if the network scene stream arrives later than the eye stream">
              <Clock3 size={14} aria-hidden="true" /> Timing
            </summary>
            <label className={`eye-field ${EyeFieldStyles}`}>
              Delay · ms
              <input
                type="number"
                aria-label="Scene arrival delay relative to eye (ms)"
                title="Positive when the scene stream arrives later than the eye stream. Changes require recalibration."
                min={-500}
                max={500}
                step={10}
                disabled={recording || !!state.capture}
                value={state.delayMs}
                onChange={(e) => state.session.setDelay(Number(e.target.value))}
              />
            </label>
          </details>
        )}
        <div hidden={active !== 2}>
          <RecordingControls
            camera={scene.camera}
            tracker={tracker}
            state={state}
            hand={hands.hand}
            identity={identity}
            onRecordingChange={setRecording}
          />
        </div>
      </SetupStepPanel>
    </section>
  )
}
