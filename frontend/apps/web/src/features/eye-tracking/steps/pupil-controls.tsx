import { useState } from "react"
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
  const spatial = settings.format === "spatial"
  const manual = !spatial || settings.thresholdMode === "manual"
  const [draft, setDraft] = useState<number | null>(null)
  const minimum = manual ? 0 : -50,
    maximum = manual ? 255 : 80
  const commit = () => {
    if (draft !== null && draft !== settings.threshold)
      update({ threshold: Math.max(minimum, Math.min(maximum, draft)) })
    setDraft(null)
  }
  const selected = frame?.detection.previews[frame.detection.selected]
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
      {spatial && (
        <div className="eye-threshold-modes" aria-label="Threshold mode">
          <button
            aria-pressed={!manual}
            onClick={() => {
              setDraft(null)
              update({ thresholdMode: "auto", threshold: 0 })
            }}
          >
            Auto
          </button>
          <button
            aria-pressed={manual}
            onClick={() => {
              setDraft(null)
              update({
                thresholdMode: "manual",
                threshold: selected?.threshold ?? 50,
              })
            }}
          >
            Manual
          </button>
        </div>
      )}
      <label className="eye-field">
        {manual ? "Dark-pupil cutoff" : "Auto threshold bias"}
        <span className="eye-range">
          <input
            type="range"
            aria-label={manual ? "Pupil threshold" : "Auto threshold bias"}
            min={minimum}
            max={maximum}
            value={draft ?? settings.threshold}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <input
            className="eye-threshold-value"
            type="number"
            aria-label="Threshold value"
            min={minimum}
            max={maximum}
            value={draft ?? settings.threshold}
            onChange={(e) => setDraft(Number(e.target.value))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
            }}
          />
        </span>
      </label>
      <p className="eye-threshold-levels">
        {manual
          ? `0 dark · 255 light${spatial ? "" : " · equalized image"}`
          : `Cutoffs ${frame?.detection.previews.map((p) => p.threshold).join(" / ") || "—"}`}
      </p>
      <p className="eye-small">
        Use Threshold view. The pupil should be one white region.
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
