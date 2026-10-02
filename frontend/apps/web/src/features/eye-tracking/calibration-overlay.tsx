import { useEffect, useRef, useState } from "react"
import { ArrowRight, X } from "lucide-react"
import { gazeFeature, mapGaze } from "./calibration"
import { CalibrationSession } from "./calibration-session"
import { HeadPreview } from "./head-tracking/head-preview"
import { CalibrationTarget } from "./calibration-target"
import type { CalibrationOverlayProps } from "./calibration-overlay.types"
import type { CalibrationObservation } from "./calibration-session.types"
import { GazeFrameSynchronizer } from "./head-tracking/head-synchronization"

export function CalibrationOverlay({
  tracker,
  head,
  calibration,
  validation,
  fitting = false,
  seedSamples,
  orientation,
  onComplete,
  onDiagnosticReading,
  onCancel,
}: CalibrationOverlayProps) {
  const needsHead =
    head.enabled && (!validation || !!calibration?.headCompensation)
  const [session] = useState(
    () =>
      new CalibrationSession({
        screenAspectRatio: window.innerWidth / window.innerHeight,
        headEnabled: needsHead,
        orientation,
        validation: validation ? calibration : null,
        seedSamples,
      })
  )
  const [snapshot, setSnapshot] = useState(session.snapshot)
  const dialog = useRef<HTMLDivElement | null>(null)
  const complete = useRef(onComplete)
  const submitted = useRef(false)
  const { latest, setSampleTarget, source } = tracker
  const headLatest = head.latest
  const headHistory = head.history
  useEffect(() => {
    complete.current = onComplete
  }, [onComplete])
  useEffect(() => {
    const container = dialog.current
    if (!container || container.contains(document.activeElement)) return
    container
      .querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus()
  }, [snapshot.phase])
  useEffect(() => {
    if (snapshot.phase === "intro" || snapshot.phase === "error") {
      setSampleTarget(null)
    } else {
      setSampleTarget(snapshot.target)
    }
    return () => setSampleTarget(null)
  }, [setSampleTarget, snapshot.phase, snapshot.target])
  useEffect(() => {
    const synchronizer = new GazeFrameSynchronizer()
    const timer = setInterval(() => {
      if (submitted.current) return
      const now = performance.now()
      const pair = needsHead
        ? synchronizer.read(latest.current, headHistory.current, now)
        : null
      const frame = pair?.eye ?? latest.current
      const feature = frame?.gaze ? gazeFeature(frame.gaze.direction) : null
      let observation: CalibrationObservation | null = null
      if (
        frame &&
        feature &&
        frame.detection.ellipse &&
        frame.detection.ellipse.confidence >= 0.5
      ) {
        observation = {
          id: frame.id,
          timestamp: frame.timestamp,
          feature,
          headPose: pair?.head,
        }
      }
      const before = session.snapshot
      session.observe(observation, now)
      if (before.phase !== "intro" && onDiagnosticReading) {
        let point = null
        if (calibration && feature)
          point = mapGaze(calibration, feature, pair?.head)
        let status = "paired"
        if (!observation) status = "eye-lost"
        else if (needsHead && !pair) status = "unpaired"
        onDiagnosticReading({
          mode: validation ? "validation" : "calibration",
          now,
          eye: frame,
          head: headLatest.current,
          pairedHead: pair?.head ?? null,
          point,
          status,
          target: before.target,
          phase: before.phase,
          instruction: session.snapshot.instruction,
        })
      }
      setSnapshot(session.snapshot)
      if (session.snapshot.phase === "complete") {
        submitted.current = true
        complete.current(session.samples)
      }
    }, 40)
    return () => clearInterval(timer)
  }, [
    needsHead,
    headHistory,
    headLatest,
    latest,
    session,
    onDiagnosticReading,
    calibration,
    validation,
  ])

  function start(): void {
    session.start(performance.now())
    setSnapshot(session.snapshot)
  }

  const intro = snapshot.phase === "intro"
  const failed = snapshot.phase === "error"
  const waiting =
    snapshot.progress === 0 && snapshot.instruction !== "Look at the dot"
  let title = "Look at each dot until it pops"
  let startLabel = "Start calibration"
  let introduction = "Dots first, then gentle head movements."
  if (seedSamples) {
    title = "Retry head movements"
    startLabel = "Start head pass"
    introduction = "Your gaze dots are saved. Follow the head movements."
  }
  if (validation) {
    title = "Follow the dots to check your accuracy"
    startLabel = "Start validation"
  }
  if (failed) title = "Let’s try that again"
  return (
    <div
      ref={dialog}
      className="eye-calibration"
      role="dialog"
      aria-modal="true"
      aria-label={validation ? "Validate gaze accuracy" : "Calibrate gaze"}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel()
        if (event.key !== "Tab") return
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
      <div className="eye-calibration-top">
        <span>{snapshot.label}</span>
        <button
          className="eye-icon-button"
          autoFocus={!intro}
          onClick={onCancel}
          aria-label="Cancel calibration"
          title="Cancel calibration (Esc)"
        >
          <X size={20} />
        </button>
      </div>
      {head.enabled && (
        <div
          className={`eye-head-floating ${snapshot.target[0] <= 0.5 ? "on-right" : ""}`}
        >
          <HeadPreview head={head} compact />
        </div>
      )}
      {(intro || failed || fitting) && (
        <div className="eye-calibration-welcome">
          <h2>{fitting ? "Fitting calibration…" : title}</h2>
          {intro && needsHead && !validation && !fitting && (
            <p className="eye-small">{introduction}</p>
          )}
          {source?.kind === "sample" && (
            <p className="eye-small">Synthetic sample · simulated results</p>
          )}
          {failed && (
            <p className="eye-calibration-error" role="alert">
              {snapshot.instruction}
            </p>
          )}
          {!failed && !fitting && (
            <button
              className="eye-button primary eye-calibration-start"
              autoFocus
              disabled={needsHead && head.status !== "tracking"}
              onClick={start}
            >
              {startLabel}
              <ArrowRight size={18} />
            </button>
          )}
          {failed && (
            <button
              className="eye-button primary eye-calibration-start"
              onClick={onCancel}
            >
              Back to setup
            </button>
          )}
          {intro && needsHead && head.status !== "tracking" && (
            <p className="eye-small">
              Keep your face visible in the front camera to start.
            </p>
          )}
        </div>
      )}
      {!intro && !failed && !fitting && (
        <>
          <div
            className="eye-calibration-target"
            style={{
              left: `${snapshot.target[0] * 100}%`,
              top: `${snapshot.target[1] * 100}%`,
            }}
          >
            <CalibrationTarget
              key={snapshot.label}
              progress={snapshot.progress}
              bursting={snapshot.phase === "burst"}
            />
          </div>
          <p
            className={waiting ? "eye-calibration-feedback" : "eye-sr-only"}
            role="status"
          >
            {snapshot.instruction}
          </p>
        </>
      )}
    </div>
  )
}
