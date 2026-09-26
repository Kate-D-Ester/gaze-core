import { useState } from "react"
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
  const minimum = manual ? 0 : -50,
    maximum = manual ? 255 : 80
  const commit = () => {
    if (draft !== null && draft !== settings.threshold)
      update({ threshold: Math.max(minimum, Math.min(maximum, draft)) })
    setDraft(null)
  }
  const selected = frame?.detection.previews[frame.detection.selected]
  return (
    <section
      className="eye-threshold-controls"
      aria-label="Threshold adjustment"
    >
      <div className="eye-threshold-heading">
        <strong>Threshold</strong>
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
      <label className="eye-field">
        {manual ? "Dark-pupil cutoff" : "Auto threshold bias"}
        <span className="eye-range">
          <input
            type="range"
            aria-label={manual ? "Pupil threshold" : "Auto threshold bias"}
            min={minimum}
            max={maximum}
            value={draft ?? settings.threshold}
            onInput={(e) => {
              setDraft(null)
              update({ threshold: Number(e.currentTarget.value) })
            }}
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
          ? `Fixed cutoff ${settings.threshold} · 0 dark / 255 light${spatial ? "" : " · equalized image"}`
          : `Using ${selected?.threshold ?? "—"} · Auto updates every frame. Manual holds this cutoff.`}
      </p>
    </section>
  )
}
