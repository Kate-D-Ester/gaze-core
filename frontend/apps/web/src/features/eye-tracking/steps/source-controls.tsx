import { ArrowRight, Upload, Play } from "lucide-react"
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
      <h3>Start with your camera.</h3>
      <p className="eye-muted">
        A close, sharp view of one eye works best. Tracker 2 is designed for a
        near-eye infrared camera.
      </p>
      <label className="eye-field">
        Camera
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">Default camera</option>
          {tracker.devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || "Camera"}
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
        <span>or explore another source</span>
      </div>
      <label className="eye-button secondary eye-upload">
        <Upload size={16} />
        Open eye video
        <input
          type="file"
          accept="video/*"
          disabled={tracker.busy || !tracker.engineReady}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              resetSource()
              void tracker.startVideo(file)
            }
            e.target.value = ""
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
      <div className="eye-source-status">
        <span className={source ? "status-light on" : "status-light"} />
        {source ? "Source connected" : "Camera is off"}
      </div>
    </>
  )
}
