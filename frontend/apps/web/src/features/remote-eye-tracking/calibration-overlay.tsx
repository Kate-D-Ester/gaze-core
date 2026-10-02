import { ArrowRight, RefreshCcw, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { CalibrationFeedback } from "../eye-tracking/calibration-feedback"
import { CalibrationTarget } from "../eye-tracking/calibration-target"
import { EyeButtonStyles } from "../tracking-ui/control-styles"
import {
  EyeCalibrationTargetStyles,
  EyeCalibrationWelcomeStyles,
} from "../tracking-ui/calibration-styles"
import {
  RemoteCalibrationStyles,
  RemoteCalibrationTopStyles,
} from "../tracking-ui/remote-styles"
import {
  CALIBRATION_TARGETS,
  VALIDATION_TARGETS,
  poseSupported,
} from "./calibration"
import type {
  CaptureProgress,
  RemoteCalibrationOverlayProps,
} from "./calibration-overlay.types"
import { observationStatus } from "./observation-status"
import { IconButton } from "./remote-controls"
import type {
  CalibrationSample,
  RemoteObservation,
} from "./remote-eye-tracking.types"
import { REQUIRED_TARGET_SAMPLES, TargetCollector } from "./sample-collector"
const TARGET_POP_MS = 260
const TARGET_TIMEOUT_MS = 20000
function initialProgress(): CaptureProgress {
  return { index: 0, count: 0, reason: "", timedOut: false, bursting: false }
}
function captureInstruction(
  observation: RemoteObservation | null,
  unsupported: boolean,
  now: number
): string {
  if (unsupported) {
    return "Return to your calibrated head position"
  }
  const detectorMessage = observationStatus(observation?.reason)
  if (detectorMessage) {
    return detectorMessage
  }
  if (!observation?.feature || !observation.pose) {
    return "Waiting for your eyes"
  }
  if (
    observation.quality < 0.45 ||
    now - observation.timestamp > 500 ||
    observation.timestamp > now ||
    !observation.feature.length ||
    !observation.feature.every(Number.isFinite)
  ) {
    return "Waiting for a clear eye reading"
  }
  return ""
}
export function RemoteCalibrationOverlay({
  latest,
  extended,
  calibration,
  onComplete,
  onCancel,
}: RemoteCalibrationOverlayProps) {
  const callbacks = useRef({ onComplete, onCancel })
  const dialog = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    callbacks.current = { onComplete, onCancel }
  }, [onComplete, onCancel])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(initialProgress)
  const [retry, setRetry] = useState(0)
  const targets = useMemo(() => {
    if (calibration) {
      return VALIDATION_TARGETS
    }
    if (extended) {
      return [...CALIBRATION_TARGETS, ...CALIBRATION_TARGETS]
    }
    return CALIBRATION_TARGETS
  }, [calibration, extended])
  useEffect(() => {
    const selector = running
      ? '[aria-label="Cancel capture"]'
      : ".eye-calibration-start"
    dialog.current?.querySelector<HTMLButtonElement>(selector)?.focus()
  }, [running])
  useEffect(() => {
    if (!running) {
      return
    }
    let animation = 0
    let index = 0
    let started = performance.now()
    let burstStarted: number | null = null
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const samples: CalibrationSample[] = []
    let collector = new TargetCollector(targets[index]!, index, started)
    function tick(): void {
      const now = performance.now()
      if (burstStarted !== null) {
        if (now - burstStarted < TARGET_POP_MS) {
          animation = requestAnimationFrame(tick)
          return
        }
        index++
        if (index === targets.length) {
          callbacks.current.onComplete(samples, viewport)
          return
        }
        started = now
        burstStarted = null
        collector = new TargetCollector(targets[index]!, index, started)
      }
      const observation = latest.current
      const unsupported = Boolean(
        calibration &&
        observation?.pose &&
        !poseSupported(calibration, observation.pose)
      )
      if (!unsupported) {
        collector.add(observation, now)
      }
      const timedOut = !collector.complete && now - started > TARGET_TIMEOUT_MS
      if (collector.complete) {
        samples.push(...collector.samples)
        burstStarted = now
      }
      setProgress({
        index,
        count: collector.samples.length,
        reason: captureInstruction(observation, unsupported, now),
        timedOut,
        bursting: collector.complete,
      })
      if (!timedOut) {
        animation = requestAnimationFrame(tick)
      }
    }
    animation = requestAnimationFrame(tick)
    function cancelAfterResize(): void {
      if (
        window.innerWidth !== viewport.width ||
        window.innerHeight !== viewport.height
      ) {
        callbacks.current.onCancel()
      }
    }
    window.addEventListener("resize", cancelAfterResize)
    return () => {
      cancelAnimationFrame(animation)
      window.removeEventListener("resize", cancelAfterResize)
    }
    // Retry starts the whole sequence again, without mixing interrupted captures.
  }, [running, latest, calibration, retry, targets])
  const target = targets[progress.index]!
  const movingPass =
    !calibration && extended && progress.index >= CALIBRATION_TARGETS.length
  let title = "Look at each dot until it pops"
  let startLabel = "Start calibration"
  let label = "Calibrate"
  let introduction =
    "Keep looking at the dot. When it pops, follow the next one."
  let instruction = progress.reason
  if (extended && !calibration) {
    introduction = "Follow the dots. On the second pass, move your head gently."
  }
  if (movingPass) {
    label = "Head positions"
    if (!instruction) {
      instruction = "Move your head gently. Keep looking at the dot."
    }
  }
  if (calibration) {
    title = "Follow the dots to check your accuracy"
    startLabel = "Start validation"
    label = "Validate"
  }
  if (progress.timedOut) {
    instruction = "Not enough samples. Adjust lighting and retry."
  }
  if (progress.bursting) {
    instruction = ""
  }
  return (
    <div
      ref={dialog}
      className={`remote-calibration ${RemoteCalibrationStyles}`}
      role="dialog"
      aria-modal="true"
      aria-label={calibration ? "Gaze validation" : "Gaze calibration"}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel()
        }
        if (event.key !== "Tab") {
          return
        }
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])"
          )
        )
        const first = buttons[0]
        const last = buttons.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <div className={`remote-calibration-top ${RemoteCalibrationTopStyles}`}>
        <span>{running ? "" : label}</span>
        <IconButton label="Cancel capture" icon={X} onClick={onCancel} />
      </div>
      {!running && (
        <div
          className={`eye-calibration-welcome ${EyeCalibrationWelcomeStyles}`}
        >
          <h2>{title}</h2>
          <p>{introduction}</p>
          <button
            className={`eye-button ${EyeButtonStyles} primary eye-calibration-start`}
            onClick={() => setRunning(true)}
          >
            {startLabel}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {running && (
        <>
          <div
            className={`remote-target eye-calibration-target ${EyeCalibrationTargetStyles}`}
            style={{ left: `${target[0] * 100}%`, top: `${target[1] * 100}%` }}
          >
            <CalibrationTarget
              key={`${retry}:${progress.index}`}
              progress={progress.count / REQUIRED_TARGET_SAMPLES}
              bursting={progress.bursting}
            />
          </div>
          <CalibrationFeedback
            target={target}
            label={
              progress.timedOut
                ? ""
                : `${label} · ${progress.index + 1}/${targets.length}`
            }
            instruction={instruction}
            action={
              progress.timedOut && (
                <IconButton
                  label="Retry capture"
                  icon={RefreshCcw}
                  primary
                  onClick={() => {
                    setProgress(initialProgress())
                    setRetry((value) => value + 1)
                  }}
                />
              )
            }
          />
        </>
      )}
    </div>
  )
}
