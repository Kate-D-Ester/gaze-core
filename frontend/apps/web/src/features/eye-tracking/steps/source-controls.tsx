import { LoaderCircle, Plug, RefreshCw, Usb, Wifi, X } from "lucide-react"
import { EyeActionButton } from "../components/eye-action-button"
import { useCameraSourcePreferences } from "../use-camera-source-preferences"
import type { SourceControlsProps } from "./source-controls.types"

export function SourceControls({
  tracker,
  deviceId,
  setDeviceId,
  resetSource,
}: SourceControlsProps) {
  const {
    kind,
    url: streamUrl,
    setKind,
    setUrl: setStreamUrl,
  } = useCameraSourcePreferences()
  const cameras = tracker.devices.filter((device) => device.deviceId)
  let previewButtonLabel = "Connect"

  if (tracker.source) {
    previewButtonLabel = "Reconnect"
  }
  if (tracker.busy) {
    previewButtonLabel = "Connecting…"
  }
  let ConnectionIcon = tracker.source ? RefreshCw : Plug
  if (tracker.busy) {
    ConnectionIcon = LoaderCircle
  }

  function startPreview() {
    resetSource()
    if (kind === "usb") {
      void tracker.startCamera(deviceId)
    } else {
      void tracker.startNetworkStream(streamUrl)
    }
  }

  return (
    <>
      <div className="eye-source-type" role="group" aria-label="Camera type">
        <button
          className="eye-button secondary"
          aria-label="USB camera"
          title="USB camera"
          data-tooltip="USB camera"
          aria-pressed={kind === "usb"}
          onClick={() => setKind("usb")}
        >
          <Usb size={19} aria-hidden="true" />
        </button>
        <button
          className="eye-button secondary"
          aria-label="Network stream"
          title="Network / IP / mDNS stream"
          data-tooltip="Network / IP / mDNS stream"
          aria-pressed={kind === "network"}
          onClick={() => setKind("network")}
        >
          <Wifi size={19} aria-hidden="true" />
        </button>
      </div>

      {kind === "usb" ? (
        <label className="eye-field">
          <select
            aria-label="Eye camera"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            <option value="">Default camera</option>
            {cameras.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label.trim() || `Camera ${index + 1}`}
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
            size={16}
            className={tracker.busy ? "eye-spinner" : undefined}
            aria-hidden="true"
          />
          {previewButtonLabel}
        </button>
        {tracker.busy && (
          <EyeActionButton label="Cancel connection" onClick={tracker.stop}>
            <X size={17} aria-hidden="true" />
          </EyeActionButton>
        )}
      </div>
    </>
  )
}
