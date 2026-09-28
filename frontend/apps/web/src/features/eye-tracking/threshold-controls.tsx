import { useState, type CSSProperties } from "react"
import type { FrameSettings } from "./types"
import type { TrackerController } from "./use-tracker"

export function ThresholdControls({
  tracker,
  update,
}: {
  tracker: TrackerController
  update: (next: Partial<FrameSettings>) => void
}) {
  const { settings, frame } = tracker
  const spatial = settings.format === "spatial"
  const manual = !spatial || settings.thresholdMode === "manual"
  const [draft, setDraft] = useState<number | null>(null)
  const minimum = manual ? 0 : -50
  const maximum = manual ? 255 : 80
  const value = draft ?? settings.threshold
  const progress = ((value - minimum) / (maximum - minimum)) * 100
  const selected = frame?.detection.previews[frame.detection.selected]
  const commit = () => {
    if (draft !== null && draft !== settings.threshold)
      update({ threshold: Math.max(minimum, Math.min(maximum, draft)) })
    setDraft(null)
  }

  return (
    <section
      className="eye-threshold-controls"
      aria-label="Threshold adjustment"
    >
      <div className="eye-threshold-heading">
        <div className="eye-threshold-title">
          <strong>Threshold</strong>
          <span>{manual ? "Pupil cutoff" : "Adaptive"}</span>
        </div>
        {spatial && (
          <div className="eye-threshold-modes" aria-label="Threshold mode">
            <button
              aria-pressed={!manual}
              onClick={() => {
                if (!manual) return
                setDraft(null)
                update({ thresholdMode: "auto", threshold: 0 })
              }}
            >
              Auto
            </button>
            <button
              aria-pressed={manual}
              onClick={() => {
                if (manual) return
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
      </div>
      <div className="eye-threshold-control-row">
        <label
          className="eye-threshold-field-label"
          htmlFor="eye-threshold-range"
        >
          {manual ? "Cutoff" : "Auto bias"}
        </label>
        <input
          id="eye-threshold-range"
          className="eye-threshold-slider"
          type="range"
          aria-label={manual ? "Pupil threshold" : "Auto threshold bias"}
          aria-valuetext={
            manual ? `${value} dark-pupil cutoff` : `Automatic bias ${value}`
          }
          min={minimum}
          max={maximum}
          value={value}
          style={{ "--threshold-progress": `${progress}%` } as CSSProperties}
          onInput={(event) => {
            setDraft(null)
            update({ threshold: Number(event.currentTarget.value) })
          }}
        />
        <input
          className="eye-threshold-value"
          type="number"
          aria-label="Threshold value"
          min={minimum}
          max={maximum}
          value={value}
          onChange={(event) => {
            const next = Number(event.currentTarget.value)
            setDraft(Number.isFinite(next) ? next : 0)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit()
          }}
        />
      </div>
      <p className="eye-threshold-levels">
        {manual ? "0 dark · 255 light" : "Auto adapts each frame"}
      </p>
    </section>
  )
}
