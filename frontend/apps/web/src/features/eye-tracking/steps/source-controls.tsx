import { useState } from "react"
import { ArrowRight } from "lucide-react"
import type { SourceControlsProps } from "./source-controls.types"

export function SourceControls({
  tracker,
  deviceId,
  setDeviceId,
  resetSource,
}: SourceControlsProps) {
  const [kind, setKind] = useState<"usb" | "network">("usb")
  const [streamUrl, setStreamUrl] = useState("")
  const cameras = tracker.devices.filter((device) => device.deviceId)
  let previewButtonLabel = "Start preview"

  if (tracker.source) {
    previewButtonLabel = "Reconnect"
  }
  if (tracker.busy) {
    previewButtonLabel = "Connecting…"
  }

  function startPreview() {
    resetSource()
    if (kind === "usb") void tracker.startCamera(deviceId)
    else void tracker.startNetworkStream(streamUrl)
  }

  return (
    <>
      <div className="eye-source-type" role="group" aria-label="Camera type">
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
          Network Stream
        </button>
      </div>

      {kind === "usb" ? (
        <label className="eye-field">
          Camera
          <select
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
          Network stream URL
          <input
            type="url"
            value={streamUrl}
            onChange={(event) => setStreamUrl(event.target.value)}
            placeholder="http://camera.local/stream.mp4"
          />
        </label>
      )}

      <button
        className="eye-button primary"
        disabled={
          tracker.busy ||
          !tracker.engineReady ||
          (kind === "network" && !streamUrl.trim())
        }
        onClick={startPreview}
      >
        {previewButtonLabel}
        <ArrowRight size={16} />
      </button>
      {tracker.busy && (
        <button className="eye-text-button" onClick={tracker.stop}>
          Cancel connection
        </button>
      )}
    </>
  )
}
