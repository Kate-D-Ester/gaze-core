import { useMemo, useRef, useState } from "react"
import {
  adaptiveCalibrationTargets,
  createAdaptiveCalibration,
  createHeadCalibration,
  finishAdaptiveCapture,
  HEAD_HOLD_DURATION_MS,
  retryAdaptiveCalibration,
} from "./adaptive-calibration"
import { RemoteCalibrationOverlay } from "./calibration-overlay"
import { RemoteFixationGuide } from "./fixation-guide"
import type { AdaptiveCalibrationState } from "./adaptive-calibration.types"
import type { AdaptiveCalibrationOverlayProps } from "./adaptive-calibration-overlay.types"
import type {
  CaptureViewport,
  RemoteCalibrationOverlayProps,
} from "./calibration-overlay.types"
import type { TargetCollectorOptions } from "./sample-collector.types"

const FIXATION_HOLD: TargetCollectorOptions = {
  minimumSamples: 18,
  minimumDurationMs: 600,
}
const HEAD_HOLD: TargetCollectorOptions = {
  minimumSamples: 48,
  minimumDurationMs: HEAD_HOLD_DURATION_MS,
}

/** One screen-wide setup, with an optional learned motion correction at the center. */
export function AdaptiveCalibrationOverlay({
  mode,
  latest,
  headMovement,
  headCalibration,
  onComplete,
  onCancel,
}: AdaptiveCalibrationOverlayProps) {
  function initialState(): AdaptiveCalibrationState {
    if (headCalibration) {
      return createHeadCalibration(
        headCalibration.model,
        headCalibration.samples
      )
    }
    return createAdaptiveCalibration(mode, headMovement)
  }
  const [state, setState] = useState(initialState)
  const [stageId, setStageId] = useState(0)
  const targets = useMemo(() => adaptiveCalibrationTargets(state), [state])
  const fixationGuide = useMemo(
    () => new RemoteFixationGuide(mode, state.training),
    [mode, state.training]
  )
  const completed = useRef(false)
  const captureViewport = useRef<CaptureViewport | undefined>(
    headCalibration?.viewport
  )

  function applyCaptureResult(next: AdaptiveCalibrationState): void {
    if (completed.current) {
      return
    }
    if (next.result) {
      completed.current = true
      onComplete(next.result)
      return
    }
    setState(next)
    setStageId((value) => value + 1)
  }
  const finish: RemoteCalibrationOverlayProps["onComplete"] = (
    samples,
    viewport,
    attempts
  ) => {
    captureViewport.current ??= viewport
    applyCaptureResult(
      finishAdaptiveCapture(state, samples, viewport, attempts)
    )
  }
  let label = "Setup"
  let instruction = ""
  let title: string | undefined
  let startLabel: string | undefined
  let welcome =
    "Follow 9 dots, including the edges. Keep looking until each dot pops."
  if (headMovement) {
    welcome =
      "Follow 9 dots, then watch the center dot while gently moving your head."
  }
  if (state.phase === "head") {
    label = "Head compensation"
    instruction = "Keep watching. Repeat gentle turns, nods and tilts."
  }
  if (state.failure) {
    label = "Paused"
    const count = state.failure.targets.length
    title = "Some eye readings were missing"
    welcome = "Completed setup dots are kept. Retry the missing readings."
    startLabel = `Retry ${count} setup dots`
    if (count === 1) {
      startLabel = "Retry 1 setup dot"
    }
    if (state.failure.fitIssue === "insufficient-response") {
      title = "Eye movement wasn’t distinguishable"
      welcome = "Try brighter lighting or move closer to the camera."
    } else if (state.failure.fitIssue === "incompatible-readings") {
      title = "The camera setup changed"
      welcome = "Keep the same camera and tracking mode for the setup dots."
    }
  }
  return (
    <RemoteCalibrationOverlay
      key={`${state.phase}:${stageId}`}
      latest={latest}
      trainingTargets={targets}
      captureViewport={captureViewport.current}
      onRestartCapture={() => {
        captureViewport.current = headCalibration?.viewport
        completed.current = false
        setState(initialState())
        setStageId((value) => value + 1)
      }}
      onStart={
        state.failure
          ? () => applyCaptureResult(retryAdaptiveCalibration(state))
          : undefined
      }
      collectionOptions={state.phase === "head" ? HEAD_HOLD : FIXATION_HOLD}
      fixationGuide={state.phase === "personal" ? fixationGuide : undefined}
      autoStart={
        state.phase === "head" ||
        (state.phase === "personal" && state.training.length > 0)
      }
      stageLabel={label}
      stageInstruction={instruction}
      welcomeInstruction={welcome}
      welcomeTitle={title}
      startButtonLabel={startLabel}
      calibration={null}
      onComplete={finish}
      onTargetTimeout={state.phase === "head" ? finish : undefined}
      onCancel={onCancel}
    />
  )
}
