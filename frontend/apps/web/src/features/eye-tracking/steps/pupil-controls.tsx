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
  const outline = frame?.detection.ellipse ?? frame?.detection.candidate
  return (
    <>
      <div className={`eye-fit-status ${usable ? "good" : ""}`}>
        <Eye size={18} />
        {usable
          ? "Tracking"
          : outline
            ? "Checking outline"
            : frame?.detection.tracking === "reacquiring"
              ? "Reacquiring"
              : "No pupil"}
        <strong>
          {outline ? `${Math.round(outline.confidence * 100)}%` : "—"}
        </strong>
      </div>
      <p className="eye-small">
        {frame?.detection.candidate
          ? frame.detection.reason
          : "A solid mint outline is tracked. A dashed outline is not used for gaze."}
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
