import { Eye } from "lucide-react"
import type { FrameSettings } from "../types"
import type { TrackerController } from "../use-tracker"

export function PupilControls({
  tracker,
  update,
  usable,
}: {
  tracker: TrackerController
  update: (next: Partial<FrameSettings>) => void
  usable: boolean
}) {
  const { settings, source, frame } = tracker
  return (
    <>
      <div className={`eye-fit-status ${usable ? "good" : ""}`}>
        <Eye size={19} />
        {usable ? "Pupil found" : "Looking for pupil"}
        <strong>
          {frame?.detection.ellipse
            ? `${Math.round(frame.detection.ellipse.confidence * 100)}%`
            : "—"}
        </strong>
      </div>
      <h3>Check the green outline.</h3>
      <p className="eye-muted">
        It should stay on the pupil, including when you look to the sides.
        Adjust only if the outline drifts.
      </p>
      <label className="eye-field">
        {settings.format === "spatial"
          ? "Threshold adjustment"
          : "Pupil threshold"}
        <span className="eye-range">
          <input
            type="range"
            min={settings.format === "spatial" ? -10 : 10}
            max={settings.format === "spatial" ? 40 : 200}
            value={settings.threshold}
            onChange={(e) => update({ threshold: Number(e.target.value) })}
          />
          <output>{settings.threshold}</output>
        </span>
      </label>
      <p className="eye-small">
        {settings.format === "spatial"
          ? "Three thresholds are compared automatically."
          : "Uses the existing dark-pupil detection algorithm."}
      </p>
      {source?.kind === "sample" && (
        <button
          className="eye-button secondary"
          onPointerDown={() => tracker.setBlink(true)}
          onPointerUp={() => tracker.setBlink(false)}
          onPointerLeave={() => tracker.setBlink(false)}
          onKeyDown={(e) => {
            if (e.key === " ") tracker.setBlink(true)
          }}
          onKeyUp={() => tracker.setBlink(false)}
          onBlur={() => tracker.setBlink(false)}
        >
          Hold to simulate a blink
        </button>
      )}
    </>
  )
}
