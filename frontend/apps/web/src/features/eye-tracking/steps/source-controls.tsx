import { ArrowRight, ChevronDown, Upload, Play } from "lucide-react"
import type { TrackerController } from "../use-tracker"

export function SourceControls({
  tracker,
  deviceId,
  setDeviceId,
  resetSource,
}: {
  tracker: TrackerController
  deviceId: string
  setDeviceId: (id: string) => void
  resetSource: () => void
}) {
  const { source } = tracker
  return (
    <>
      <label className="eye-field">
        Camera
        <select
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
        >
          <option value="">Default camera</option>
          {tracker.devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || "Camera"}
            </option>
          ))}
        </select>
      </label>
      <button
        className="eye-button primary"
        disabled={tracker.busy || !tracker.engineReady}
        onClick={() => {
          resetSource()
          void tracker.startCamera(deviceId)
        }}
      >
        {tracker.busy
          ? "Connecting…"
          : source?.kind === "camera"
            ? "Reconnect camera"
            : "Connect camera"}
        <ArrowRight size={16} />
      </button>
      {tracker.busy && (
        <button className="eye-text-button" onClick={tracker.stop}>
          Cancel connection
        </button>
      )}
      <div className="eye-divider">
        <span>or</span>
      </div>
      <div className="eye-source-options">
        <label className="eye-button secondary eye-upload">
          <Upload size={15} />
          Eye video
          <input
            type="file"
            accept="video/*"
            aria-label="Open eye video"
            disabled={tracker.busy || !tracker.engineReady}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                resetSource()
                void tracker.startVideo(file)
              }
              event.target.value = ""
            }}
          />
        </label>
        <button
          className="eye-button secondary"
          disabled={!tracker.engineReady}
          onClick={() => {
            resetSource()
            tracker.startSample()
          }}
        >
          <Play size={15} />
          Try sample
        </button>
      </div>
      <details className="eye-details">
        <summary>
          Camera tips
          <ChevronDown size={14} />
        </summary>
        <p className="eye-small">
          Use a close, sharp view of one eye. Tracker 2 works best with a
          near-eye infrared camera.
        </p>
      </details>
    </>
  )
}
