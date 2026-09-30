import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  CALIBRATION_TARGETS,
  VALIDATION_TARGETS,
  poseSupported,
} from "./calibration"
import { observationStatus } from "./observation-status"
import { TargetCollector } from "./sample-collector"
import type {
  CalibrationSample,
  RemoteCalibration,
  RemoteObservation,
} from "./types"

type Props = {
  latest: RefObject<RemoteObservation | null>
  extended: boolean
  calibration: RemoteCalibration | null
  onComplete: (
    samples: CalibrationSample[],
    viewport: { width: number; height: number }
  ) => void
  onCancel: () => void
}
export function RemoteCalibrationOverlay({
  latest,
  extended,
  calibration,
  onComplete,
  onCancel,
}: Props) {
  const callbacks = useRef({ onComplete, onCancel })
  useEffect(() => {
    callbacks.current = { onComplete, onCancel }
  }, [onComplete, onCancel])
  const [progress, setProgress] = useState({
    index: 0,
    count: 0,
    reason: "Look at the dot",
    timedOut: false,
  })
  const [retry, setRetry] = useState(0)
  const targets = useMemo(() => {
    if (calibration) return VALIDATION_TARGETS
    return extended
      ? [...CALIBRATION_TARGETS, ...CALIBRATION_TARGETS]
      : CALIBRATION_TARGETS
  }, [calibration, extended])
  useEffect(() => {
    let frame = 0,
      index = 0,
      started = performance.now()
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const samples: CalibrationSample[] = []
    let collector = new TargetCollector(targets[index]!, index, started)
    const tick = () => {
      const now = performance.now()
      const observation = latest.current
      const unsupported =
        calibration &&
        observation?.pose &&
        !poseSupported(calibration, observation.pose)
      if (!unsupported) collector.add(observation, now)
      const timedOut = now - started > 20000
      setProgress({
        index,
        count: collector.samples.length,
        reason: unsupported
          ? "Return to your calibrated head position"
          : (observationStatus(observation?.reason) ??
            (!observation?.feature
              ? "Waiting for your eyes"
              : "Keep looking at the dot")),
        timedOut,
      })
      if (collector.complete) {
        samples.push(...collector.samples)
        index++
        if (index === targets.length) {
          callbacks.current.onComplete(samples, viewport)
          return
        }
        started = now
        collector = new TargetCollector(targets[index]!, index, started)
      }
      if (!timedOut) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const resized = () => {
      if (
        window.innerWidth !== viewport.width ||
        window.innerHeight !== viewport.height
      )
        callbacks.current.onCancel()
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") callbacks.current.onCancel()
    }
    window.addEventListener("resize", resized)
    window.addEventListener("keydown", keydown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resized)
      window.removeEventListener("keydown", keydown)
    }
    // A retry deliberately restarts all targets to avoid mixing interrupted captures.
  }, [latest, calibration, retry, targets])
  const target = targets[progress.index]!
  const movingPass =
    !calibration && extended && progress.index >= CALIBRATION_TARGETS.length
  let title = movingPass ? "Add head positions" : "Calibrate"
  if (calibration) title = "Validate"
  return (
    <div
      className="remote-calibration"
      role="dialog"
      aria-modal="true"
      aria-label={calibration ? "Gaze validation" : "Gaze calibration"}
    >
      <div className="remote-calibration-top">
        <span>
          {title} · {progress.index + 1}/{targets.length}
        </span>
        <button className="remote-button secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div
        className="remote-target"
        style={{ left: `${target[0] * 100}%`, top: `${target[1] * 100}%` }}
      >
        <span />
      </div>
      <div className="remote-calibration-help" aria-live="polite">
        <strong>
          {movingPass
            ? "Look at the dot. Gently turn or shift your head."
            : "Follow the dot with your eyes."}
        </strong>
        <p>
          {progress.reason} · {progress.count}/18 samples
        </p>
        {movingPass && (
          <p>
            Use small, comfortable movements. Each frame keeps its own head
            position.
          </p>
        )}
        {progress.timedOut && (
          <>
            <p>
              Not enough clear samples. Improve the lighting or camera framing,
              then retry.
            </p>
            <button
              className="remote-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry capture
            </button>
          </>
        )}
      </div>
    </div>
  )
}
