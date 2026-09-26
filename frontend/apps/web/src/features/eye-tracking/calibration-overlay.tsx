import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import {
  CALIBRATION_TARGETS,
  VALIDATION_TARGETS,
  gazeFeature,
} from "./calibration"
import type { CalibrationSample, Point } from "./types"
import type { TrackerController } from "./use-tracker"

export function CalibrationOverlay({
  tracker,
  validation,
  onComplete,
  onCancel,
}: {
  tracker: TrackerController
  validation: boolean
  onComplete: (samples: CalibrationSample[]) => void
  onCancel: () => void
}) {
  const targets = validation ? VALIDATION_TARGETS : CALIBRATION_TARGETS
  const [index, setIndex] = useState(0),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState("Look at the dot")
  const completed = useRef<CalibrationSample[]>([])
  const { latest, setSampleTarget, source } = tracker
  useEffect(() => {
    const target = targets[index]
    setSampleTarget(target)
    let samples: Point[] = [],
      lastId = -1,
      started = performance.now(),
      done = false
    const interval = setInterval(() => {
      if (done) return
      const frame = latest.current,
        now = performance.now()
      if (!frame?.gaze || now - frame.timestamp > 500) {
        samples = []
        started = now
        setProgress(0)
        setMessage("Pupil lost · keep your eye visible")
        return
      }
      if (frame.id === lastId) return
      lastId = frame.id
      if (now - started < 750) {
        setMessage("Look at the dot")
        return
      }
      const feature = gazeFeature(frame.gaze.direction)
      if (!feature) return
      samples.push(feature)
      if (samples.length > 24) samples.shift()
      const mean: Point = [0, 1].map(
        (axis) => samples.reduce((s, p) => s + p[axis], 0) / samples.length
      ) as Point
      const spread = Math.sqrt(
        samples.reduce(
          (s, p) => s + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2,
          0
        ) / samples.length
      )
      if (spread > 0.035) {
        samples = samples.slice(-5)
        setProgress(0)
        setMessage("Hold your gaze steady")
        return
      }
      setMessage("Keep looking")
      setProgress(samples.length / 24)
      if (samples.length < 24) return
      done = true
      completed.current.push({ feature: mean, target })
      if (index === targets.length - 1) onComplete(completed.current)
      else setIndex((i) => i + 1)
    }, 40)
    return () => {
      clearInterval(interval)
      setSampleTarget(null)
    }
  }, [index, latest, onComplete, setSampleTarget, targets])
  return (
    <div
      className="eye-calibration"
      role="dialog"
      aria-modal="true"
      aria-label={validation ? "Validate gaze accuracy" : "Calibrate gaze"}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel()
      }}
    >
      <div className="eye-calibration-top">
        <span>
          {validation ? "VALIDATION" : "CALIBRATION"}{" "}
          <b>
            {index + 1} / {targets.length}
          </b>
        </span>
        <button autoFocus onClick={onCancel} aria-label="Cancel calibration">
          <X size={20} />
        </button>
      </div>
      <div className="eye-calibration-instruction">
        <h2>{message}</h2>
        <p>
          {source?.kind === "sample"
            ? "Synthetic sample · simulated results"
            : "Keep your head still. Each point captures automatically."}
        </p>
      </div>
      <div
        className="eye-calibration-target"
        style={{
          left: `${targets[index][0] * 100}%`,
          top: `${targets[index][1] * 100}%`,
        }}
      >
        <svg viewBox="0 0 60 60" aria-hidden="true">
          <circle cx="30" cy="30" r="25" className="target-track" />
          <circle
            cx="30"
            cy="30"
            r="25"
            className="target-progress"
            strokeDasharray={`${progress * 157} 157`}
          />
        </svg>
        <i />
      </div>
      <p className="eye-calibration-bottom">
        {validation
          ? "Checking new points that were not used for calibration."
          : "Follow the dot with your eyes."}{" "}
        Press Esc to cancel.
      </p>
    </div>
  )
}
