import { Eye } from "lucide-react"
import type { TrackerController } from "../use-tracker"

export function PupilControls({
  tracker,
  usable,
}: {
  tracker: TrackerController
  usable: boolean
}) {
  const { source, frame } = tracker
  return (
    <>
      <div className={`eye-fit-status ${usable ? "good" : ""}`}>
        <Eye size={18} />
        {usable
          ? "Tracking"
          : frame?.detection.tracking === "reacquiring"
            ? "Reacquiring"
            : "No pupil"}
        <strong>
          {frame?.detection.ellipse
            ? `${Math.round(frame.detection.ellipse.confidence * 100)}%`
            : "—"}
        </strong>
      </div>
      <p className="eye-small">
        Tune the threshold above the preview until the outline follows the
        pupil.
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
          Hold to blink
        </button>
      )}
    </>
  )
}
