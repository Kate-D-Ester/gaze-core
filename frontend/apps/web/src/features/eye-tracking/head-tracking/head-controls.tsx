import { useState } from "react"
import { ArrowRightToLine, Camera, CameraOff } from "lucide-react"
import { EyeActionButton } from "../components/eye-action-button"
import { HeadPreview } from "./head-preview"
import { HeadOrientationControls } from "./head-orientation-controls"
import type { HeadCameraTransform } from "./head-camera-transform.types"
import type { HeadControlsProps } from "./head-controls.types"

export function HeadControls({
  head,
  devices,
  eyeDeviceId,
  simulated,
  onConfigurationChange,
  onSkip,
}: HeadControlsProps) {
  const [deviceId, setDeviceId] = useState("")
  const availableDevices = devices.filter(
    (device) => device.deviceId !== eyeDeviceId
  )
  let status = "Optional · use a front camera."
  const cameraUnavailable = !!eyeDeviceId && availableDevices.length === 0
  if (cameraUnavailable) {
    status = "Needs a second camera. Connect one or skip."
  }
  if (head.status === "loading") status = "Loading face tracking…"
  if (head.status === "tracking") status = "Ready"
  if (head.status === "lost") status = "Keep your face in view."
  if (head.error) status = head.error

  async function connect(): Promise<void> {
    onConfigurationChange()
    let selected = deviceId
    if (!selected) {
      const integrated = availableDevices.find((device) =>
        /facetime|integrated|built.in|front/i.test(device.label)
      )
      selected = integrated?.deviceId ?? availableDevices[0]?.deviceId ?? ""
    }
    await head.start(selected)
  }

  function disconnect(): void {
    onConfigurationChange()
    head.stop()
  }

  function changeOrientation(value: HeadCameraTransform): void {
    onConfigurationChange()
    head.setTransform(value)
  }

  if (simulated)
    return (
      <section className="eye-head-setup">
        <p className="eye-small">Live eye camera required.</p>
        <EyeActionButton label="Skip head tracking" onClick={onSkip}>
          <ArrowRightToLine size={17} aria-hidden="true" />
        </EyeActionButton>
      </section>
    )
  return (
    <section
      className="eye-head-setup"
      aria-label="Front camera head compensation"
    >
      <label className="eye-field">
        <select
          aria-label="Front camera"
          value={deviceId}
          disabled={head.enabled && head.status !== "error"}
          onChange={(event) => setDeviceId(event.target.value)}
        >
          <option value="">Built-in / front camera</option>
          {availableDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <HeadOrientationControls
        value={head.transform}
        onChange={changeOrientation}
      />
      {head.enabled && <HeadPreview head={head} inline />}
      {(!head.enabled || head.error) && (
        <p className="eye-small" role={head.error ? "alert" : "status"}>
          {status}
        </p>
      )}
      <div className="eye-source-actions">
        {head.enabled && head.status !== "error" ? (
          <EyeActionButton label="Disconnect front camera" onClick={disconnect}>
            <CameraOff size={17} aria-hidden="true" />
          </EyeActionButton>
        ) : (
          <button
            className="eye-button primary"
            aria-label="Connect front camera"
            title="Connect front camera"
            disabled={cameraUnavailable}
            onClick={() => {
              void connect()
            }}
          >
            <Camera size={16} aria-hidden="true" /> Connect
          </button>
        )}
        <EyeActionButton label="Skip head tracking" onClick={onSkip}>
          <ArrowRightToLine size={17} aria-hidden="true" />
        </EyeActionButton>
      </div>
    </section>
  )
}
