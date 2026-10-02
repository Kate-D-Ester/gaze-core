import { useCameraSourcePreferences } from "../use-camera-source-preferences"
import { LoaderCircle, Plug, RefreshCw, X } from "lucide-react"
import { CameraSourceType } from "../components/camera-source-type"
import type { SourceControlsProps } from "./source-controls.types"

export function SourceControls({
  tracker,
  deviceId,
  setDeviceId,
  resetSource,
  excludedDeviceId,
}: SourceControlsProps) {
  const {
    kind,
    setKind,
    url: streamUrl,
    setUrl: setStreamUrl,
  } = useCameraSourcePreferences("eye", tracker.source)
  const cameras = tracker.devices.filter((device) => device.deviceId)
  let previewButtonLabel = "Connect"

  if (tracker.source) {
    previewButtonLabel = "Reconnect"
  }
  if (tracker.busy) {
    previewButtonLabel = "Connecting…"
  }
  if (tracker.connection === "reconnecting")
    previewButtonLabel = "Reconnecting…"
  let ConnectionIcon = tracker.source ? RefreshCw : Plug
  if (tracker.busy) ConnectionIcon = LoaderCircle

  function startPreview() {
    resetSource()
    if (kind === "usb") void tracker.startCamera(deviceId, excludedDeviceId)
    else void tracker.startNetworkStream(streamUrl)
  }

  return (
    <>
      <CameraSourceType value={kind} onChange={setKind} />

      {kind === "usb" ? (
        <label className="eye-field">
          <select
            aria-label="Eye camera"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            <option value="">Default camera</option>
            {cameras.map((device, index) => (
              <option
                key={device.deviceId}
                value={device.deviceId}
                disabled={
                  !!excludedDeviceId && device.deviceId === excludedDeviceId
                }
              >
                {device.label.trim() || `Camera ${index + 1}`}
                {device.deviceId === excludedDeviceId ? " (scene camera)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="eye-field">
          <input
            aria-label="Network stream URL"
            type="url"
            value={streamUrl}
            onChange={(event) => setStreamUrl(event.target.value)}
            placeholder="http://esp32.local/stream"
          />
        </label>
      )}

      <div className="eye-source-actions">
        <button
          className="eye-button primary"
          disabled={
            tracker.busy ||
            !tracker.engineReady ||
            (kind === "network" && !streamUrl.trim())
          }
          onClick={startPreview}
        >
          <ConnectionIcon
            className={tracker.busy ? "camera-spinner" : undefined}
            size={16}
            aria-hidden="true"
          />
          {previewButtonLabel}
        </button>
        {tracker.busy && (
          <button
            className="eye-button secondary eye-action-icon"
            aria-label="Cancel connection"
            title="Cancel connection"
            data-tooltip="Cancel connection"
            onClick={tracker.stop}
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  )
}
