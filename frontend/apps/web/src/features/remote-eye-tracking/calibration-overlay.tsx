import { ArrowRight, RefreshCcw, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { CalibrationFeedback } from "../eye-tracking/calibration-feedback"
import { CalibrationTarget } from "../eye-tracking/calibration-target"
import { EyeButtonStyles } from "../tracking-ui/control-styles"
import {
  EyeCalibrationTargetStyles,
  EyeCalibrationWelcomeStyles,
  EyeCalibrationCaptureCancelStyles,
  calibrationCancelTop,
} from "../tracking-ui/calibration-styles"
import {
  RemoteCalibrationStyles,
  RemoteCalibrationTopStyles,
} from "../tracking-ui/remote-styles"
import { CALIBRATION_TARGETS, VALIDATION_TARGETS } from "./calibration"
import type {
  CaptureProgress,
  CaptureViewport,
  RemoteCaptureSession,
  RemoteCalibrationOverlayProps,
} from "./calibration-overlay.types"
import { observationStatus } from "./observation-status"
import { IconButton } from "./remote-controls"
import type { RemoteObservation } from "./remote-eye-tracking.types"
import { TargetCollector } from "./sample-collector"
const TARGET_POP_MS = 260
const TARGET_TIMEOUT_MS = 20000
const MEASUREMENT_TIMEOUT_MS = 8700
const MISSING_FRAME_INTERVAL_MS = 500
function missingObservation(timestamp: number): RemoteObservation {
  return {
    timestamp,
    width: 0,
    height: 0,
    feature: null,
    quality: 0,
    reason: "no-fresh-frame",
    eyes: [],
    faceBox: null,
    pose: null,
    basePoint: null,
    method: "Unavailable camera reading",
    processingMs: 0,
  }
}
function initialProgress(): CaptureProgress {
  return {
    index: 0,
    count: 0,
    reason: "",
    timedOut: false,
    bursting: false,
    viewportChanged: false,
  }
}
function initialCaptureSession(): RemoteCaptureSession {
  return {
    index: 0,
    samples: [],
    attempts: [],
    lastAttempt: -Infinity,
    viewport: null,
  }
}
function currentViewport(): CaptureViewport {
  return { width: window.innerWidth, height: window.innerHeight }
}
function viewportMatches(viewport: CaptureViewport): boolean {
  return (
    window.innerWidth === viewport.width &&
    window.innerHeight === viewport.height
  )
}
function captureInstruction(
  observation: RemoteObservation | null,
  now: number
): string {
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
  targets: customTargets,
  repairTargets,
  comfortableHold = false,
  trainingTargets,
  captureViewport,
  onRestartCapture,
  collectionOptions,
  fixationGuide,
  autoStart = false,
  stageLabel,
  stageInstruction,
  welcomeInstruction,
  welcomeTitle,
  startButtonLabel,
  onStart,
  onTargetTimeout,
  calibration,
  onComplete,
  onCancel,
}: RemoteCalibrationOverlayProps) {
  const callbacks = useRef({ onComplete, onCancel, onTargetTimeout })
  const dialog = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    callbacks.current = { onComplete, onCancel, onTargetTimeout }
  }, [onComplete, onCancel, onTargetTimeout])
  const [running, setRunning] = useState(autoStart)
  const [progress, setProgress] = useState(initialProgress)
  const [retry, setRetry] = useState(0)
  const session = useRef<RemoteCaptureSession>(initialCaptureSession())
  const targets = useMemo(() => {
    if (trainingTargets?.length) {
      return trainingTargets
    }
    if (calibration) {
      return repairTargets ?? customTargets ?? VALIDATION_TARGETS
    }
    return CALIBRATION_TARGETS
  }, [calibration, customTargets, repairTargets, trainingTargets])
  useEffect(() => {
    const selector = running
      ? '[aria-label="Cancel capture"]'
      : ".eye-calibration-start"
    dialog.current
      ?.querySelector<HTMLButtonElement>(selector)
      ?.focus({ preventScroll: true })
  }, [running])
  useEffect(() => {
    if (!running) {
      return
    }
    let animation = 0
    let index = session.current.index
    let started = performance.now()
    let burstStarted: number | null = null
    const viewport = session.current.viewport ?? {
      ...(captureViewport ?? currentViewport()),
    }
    session.current.viewport = viewport
    let viewportPaused = false
    let finished = false
    const { samples, attempts } = session.current
    const measuring = Boolean(calibration && !repairTargets)
    let defaultOptions = undefined
    if (measuring) {
      defaultOptions = { minimumSamples: 18, minimumDurationMs: 1000 }
    }
    if (comfortableHold) {
      defaultOptions = { minimumSamples: 4, minimumDurationMs: 700 }
    }
    let holdOptions = collectionOptions ?? defaultOptions
    if (fixationGuide && !measuring) {
      holdOptions = {
        minimumSamples: 18,
        minimumDurationMs: 600,
        ...holdOptions,
        resetOnInvalid: true,
        accepts: (observation, collected) =>
          fixationGuide.accepts(targets[index]!, observation, collected),
      }
    }
    let collector = new TargetCollector(
      targets[index]!,
      index,
      started,
      holdOptions
    )
    function tick(): void {
      if (viewportPaused || finished) {
        return
      }
      const now = performance.now()
      if (burstStarted !== null) {
        if (now - burstStarted < TARGET_POP_MS) {
          animation = requestAnimationFrame(tick)
          return
        }
        index++
        if (index === targets.length) {
          finished = true
          callbacks.current.onComplete(samples, viewport, attempts)
          return
        }
        session.current.index = index
        started = now
        burstStarted = null
        collector = new TargetCollector(
          targets[index]!,
          index,
          started,
          holdOptions
        )
      }
      const observation = latest.current
      if (
        observation &&
        observation.timestamp >= started + 700 &&
        observation.timestamp > session.current.lastAttempt &&
        observation.timestamp <= now &&
        attempts.length < 36000
      ) {
        session.current.lastAttempt = observation.timestamp
        attempts.push({
          target: [...targets[index]!],
          targetId: index,
          observation,
        })
      }
      if (
        measuring &&
        now - started >= 700 &&
        now - Math.max(started + 700, session.current.lastAttempt) >=
          MISSING_FRAME_INTERVAL_MS
      ) {
        session.current.lastAttempt = now
        attempts.push({
          target: [...targets[index]!],
          targetId: index,
          observation: missingObservation(now),
        })
      }
      collector.add(observation, now)
      const measurementFinished =
        measuring && now - started >= MEASUREMENT_TIMEOUT_MS
      const targetComplete = collector.complete || measurementFinished
      if (
        targetComplete &&
        burstStarted === null &&
        fixationGuide &&
        !measuring
      ) {
        fixationGuide.record(targets[index]!, collector.samples)
      }
      const timedOut = !targetComplete && now - started > TARGET_TIMEOUT_MS
      if (timedOut && callbacks.current.onTargetTimeout) {
        finished = true
        callbacks.current.onTargetTimeout(
          [...samples, ...collector.samples],
          viewport,
          attempts
        )
        return
      }
      if (targetComplete) {
        samples.push(...collector.samples)
        burstStarted = now
      }
      const nextProgress: CaptureProgress = {
        index,
        count: collector.samples.length,
        fraction: collector.progress,
        reason:
          captureInstruction(observation, now) || fixationGuide?.reason || "",
        timedOut,
        bursting: targetComplete,
        viewportChanged: false,
      }
      setProgress((previous) => {
        if (
          previous.index === nextProgress.index &&
          previous.count === nextProgress.count &&
          previous.fraction === nextProgress.fraction &&
          previous.reason === nextProgress.reason &&
          previous.timedOut === nextProgress.timedOut &&
          previous.bursting === nextProgress.bursting &&
          previous.viewportChanged === nextProgress.viewportChanged
        ) {
          return previous
        }
        return nextProgress
      })
      if (!timedOut) {
        animation = requestAnimationFrame(tick)
      }
    }
    function handleViewportResize(): void {
      if (finished) {
        return
      }
      if (viewportMatches(viewport)) {
        if (!viewportPaused) {
          return
        }
        viewportPaused = false
        started = performance.now()
        if (burstStarted !== null) {
          burstStarted = started
        } else {
          const retained = attempts.filter(
            (sample) => sample.targetId !== index
          )
          attempts.splice(0, attempts.length, ...retained)
          collector = new TargetCollector(
            targets[index]!,
            index,
            started,
            holdOptions
          )
        }
        setProgress({ ...initialProgress(), index })
        animation = requestAnimationFrame(tick)
        return
      }
      // Before any accepted reading, browser chrome/layout can safely settle.
      if (
        !captureViewport &&
        !calibration &&
        samples.length === 0 &&
        collector.samples.length === 0
      ) {
        Object.assign(viewport, currentViewport())
        started = performance.now()
        collector = new TargetCollector(
          targets[index]!,
          index,
          started,
          holdOptions
        )
        attempts.length = 0
        session.current.lastAttempt = -Infinity
        return
      }
      // Never combine labels from two screen geometries, or discard completed holds automatically.
      viewportPaused = true
      cancelAnimationFrame(animation)
      setProgress((previous) => ({
        ...previous,
        timedOut: false,
        bursting: false,
        viewportChanged: true,
      }))
    }
    handleViewportResize()
    if (!viewportPaused) {
      animation = requestAnimationFrame(tick)
    }
    window.addEventListener("resize", handleViewportResize)
    return () => {
      finished = true
      cancelAnimationFrame(animation)
      window.removeEventListener("resize", handleViewportResize)
    }
    // Retry replaces only the interrupted hold; completed targets remain intact.
  }, [
    running,
    latest,
    calibration,
    retry,
    targets,
    comfortableHold,
    repairTargets,
    collectionOptions,
    fixationGuide,
    captureViewport,
  ])
  const target = targets[progress.index]!
  let title = "Look at each dot until it pops"
  let startLabel = "Start calibration"
  let label = "Calibrate"
  let introduction =
    "Keep looking at the dot. When it pops, follow the next one."
  let instruction = progress.reason
  if (calibration) {
    title = "Validation test"
    startLabel = "Continue"
    label = "Validate"
    introduction = "Look at each dot until it pops."
  }
  if (stageLabel) {
    label = stageLabel
  }
  if (stageInstruction && !instruction) {
    instruction = stageInstruction
  }
  if (welcomeInstruction) {
    introduction = welcomeInstruction
  }
  if (welcomeTitle) {
    title = welcomeTitle
  }
  if (startButtonLabel) {
    startLabel = startButtonLabel
  }
  if (progress.timedOut) {
    instruction = "Not enough samples. Adjust lighting and retry."
  }
  if (progress.bursting) {
    instruction = ""
  }
  let captureAction: ReactNode = null
  let feedbackLabel = `${label} · ${progress.index + 1}/${targets.length}`
  if (progress.viewportChanged) {
    feedbackLabel = "Paused"
    instruction = "Window size changed. Restore its size to continue."
    if (onRestartCapture || (!calibration && !captureViewport)) {
      instruction = "Window size changed. Restore it or restart capture."
      captureAction = (
        <IconButton
          label="Restart calibration at this size"
          icon={RefreshCcw}
          primary
          onClick={() => {
            if (onRestartCapture) {
              onRestartCapture()
              return
            }
            session.current = initialCaptureSession()
            setProgress(initialProgress())
            setRetry((value) => value + 1)
          }}
        />
      )
    }
  } else if (progress.timedOut) {
    feedbackLabel = ""
    captureAction = (
      <IconButton
        label="Retry capture"
        icon={RefreshCcw}
        primary
        onClick={() => {
          setProgress({ ...initialProgress(), index: session.current.index })
          setRetry((value) => value + 1)
        }}
      />
    )
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
        <IconButton
          label="Cancel capture"
          icon={X}
          onClick={onCancel}
          className={running ? EyeCalibrationCaptureCancelStyles : ""}
          style={{ top: running ? calibrationCancelTop(target) : undefined }}
        />
      </div>
      {!running && (
        <div
          className={`eye-calibration-welcome ${EyeCalibrationWelcomeStyles}`}
        >
          <h2>{title}</h2>
          <p>{introduction}</p>
          <button
            className={`eye-button ${EyeButtonStyles} primary eye-calibration-start`}
            onClick={() => {
              if (onStart) {
                onStart()
                return
              }
              setRunning(true)
            }}
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
              progress={progress.fraction ?? 0}
              bursting={progress.bursting}
            />
          </div>
          <CalibrationFeedback
            target={target}
            label={feedbackLabel}
            instruction={instruction}
            action={captureAction}
          />
        </>
      )}
    </div>
  )
}
