import { useState } from "react"
import type { SceneCamera, SceneCameraSnapshot } from "./scene-camera"
import type { SceneSession, SceneSessionSnapshot } from "./scene-session"
import type { HandTrackerSnapshot } from "./hand-tracker"
export function SceneSourceControls({
  camera,
  state,
  eyeDeviceId,
  onConnected,
}: {
  camera: SceneCamera
  state: SceneCameraSnapshot
  eyeDeviceId?: string
  onConnected: () => void
}) {
  const [kind, setKind] = useState<"usb" | "network">("usb"),
    [deviceId, setDeviceId] = useState(""),
    [url, setUrl] = useState("")
  let connectLabel = state.source
    ? "Reconnect scene camera"
    : "Connect scene camera"
  if (state.busy) connectLabel = "Connecting…"
  async function connect() {
    if (kind === "usb") await camera.startCamera(deviceId, eyeDeviceId)
    else await camera.startNetworkStream(url)
    if (camera.getSnapshot().source) onConnected()
  }
  return (
    <>
      <div
        className="eye-source-type"
        role="group"
        aria-label="Scene camera type"
      >
        <button
          className="eye-button secondary"
          aria-pressed={kind === "usb"}
          onClick={() => setKind("usb")}
        >
          USB Camera
        </button>
        <button
          className="eye-button secondary"
          aria-pressed={kind === "network"}
          onClick={() => setKind("network")}
        >
          Network / mDNS
        </button>
      </div>
      {kind === "usb" ? (
        <label className="eye-field">
          Scene camera
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <option value="">Default camera</option>
            {state.devices.map((d, i) => (
              <option
                key={d.deviceId || i}
                value={d.deviceId}
                disabled={!!eyeDeviceId && d.deviceId === eyeDeviceId}
              >
                {d.label.trim() || `Camera ${i + 1}`}
                {d.deviceId === eyeDeviceId ? " (eye camera)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="eye-field">
          Scene stream URL
          <input
            type="url"
            placeholder="http://esp32cam.local:81/stream"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      )}
      <p className="eye-help">
        Mount this camera securely with the eye camera. Keep both cameras fixed
        relative to your eye.
      </p>
      <button
        className="eye-button primary"
        disabled={state.busy || (kind === "network" && !url.trim())}
        onClick={() => void connect()}
      >
        {connectLabel}
      </button>
      {(state.source || state.busy) && (
        <button className="eye-button secondary" onClick={() => camera.stop()}>
          {state.busy ? "Cancel connection" : "Disconnect scene camera"}
        </button>
      )}
    </>
  )
}
export function FingerControls({
  session,
  state,
  hands,
  canCapture,
  retry,
  onLive,
}: {
  session: SceneSession
  state: SceneSessionSnapshot
  hands: HandTrackerSnapshot
  canCapture: boolean
  retry: () => void
  onLive: () => void
}) {
  const required = state.capture === "validation" ? 5 : 9,
    done = state.collection?.holds.length ?? 0
  return (
    <>
      <p className="scene-instruction">
        Look directly at your <strong>physical index fingertip</strong>. Move it
        across the scene and pause in each region. Use the preview to place your
        hand, then keep your eyes on your finger.
      </p>
      <p className="eye-help">
        Hold it at your working distance. Best accuracy stays near that depth;
        check again after headset movement.
      </p>
      {hands.status !== "ready" && (
        <p role="status">
          {hands.status === "loading"
            ? "Loading hand tracking…"
            : hands.error || "Hand tracking is waiting for the scene camera."}
        </p>
      )}
      {hands.status === "error" && (
        <button className="eye-button secondary" onClick={retry}>
          Retry hand tracking
        </button>
      )}
      {state.capture ? (
        <>
          <div
            className="scene-coverage"
            aria-label="Scene calibration coverage"
          >
            {Array.from({ length: 9 }, (_, i) => (
              <span
                key={i}
                className={
                  state.collection?.holds.some((h) => h.region === i)
                    ? "collected"
                    : ""
                }
              >
                {state.collection?.holds.some((h) => h.region === i)
                  ? "✓"
                  : i + 1}
              </span>
            ))}
          </div>
          <div role="status" aria-live="polite">
            {done}/{required} regions collected · {state.collection?.hint}
          </div>
          <progress
            aria-label="Current finger hold progress"
            value={state.collection?.progress ?? 0}
            max={1}
          />
          <button
            className="eye-button secondary"
            onClick={() => session.cancelCapture()}
          >
            Cancel collection
          </button>
        </>
      ) : (
        <button
          className="eye-button primary"
          disabled={!canCapture}
          onClick={() => session.startCapture("calibration")}
        >
          {state.calibration ? "Calibrate again" : "Start finger calibration"}
        </button>
      )}
      {state.calibration && !state.capture && (
        <button className="eye-button primary" onClick={onLive}>
          Open live scene gaze
        </button>
      )}
    </>
  )
}
export function SceneLiveControls({
  session,
  state,
  onCalibrate,
  canValidate,
}: {
  session: SceneSession
  state: SceneSessionSnapshot
  onCalibrate: () => void
  canValidate: boolean
}) {
  const p = state.measurement?.position
  return (
    <>
      <div className="scene-metrics">
        <div>
          <span>Gaze in scene</span>
          <strong>
            {state.measurement?.valid && p
              ? `${(p[0] * 100).toFixed(1)}%, ${(p[1] * 100).toFixed(1)}%`
              : "Waiting for valid gaze"}
          </strong>
        </div>
        <div>
          <span>Mapping</span>
          <strong>
            {state.calibration?.model} ·{" "}
            {((state.calibration?.crossValidationRms ?? 0) * 100).toFixed(1)}%
            fit RMS
          </strong>
        </div>
        {state.validation && (
          <div>
            <span>Fresh accuracy check</span>
            <strong>
              {state.validation.pixelRms.toFixed(1)} px RMS ·{" "}
              {state.validation.passed ? "passed" : "recalibrate"}
            </strong>
          </div>
        )}
      </div>
      <p role="status">
        {state.measurement?.reason ||
          (state.measurement?.extrapolated
            ? "Gaze is outside the sampled coverage; accuracy may be lower."
            : "Gaze follows your eye. Your hand is no longer needed.")}
      </p>
      <button
        className="eye-button secondary"
        disabled={!canValidate}
        onClick={() => session.startCapture("validation")}
      >
        Check accuracy with fresh finger holds
      </button>
      <button className="eye-button secondary" onClick={onCalibrate}>
        Recalibrate / headset moved
      </button>
    </>
  )
}
