import {
  SceneWorkspace,
  type SceneStatus,
} from "@/features/scene-eye-tracking/scene-workspace"
import { LiveControls } from "@/features/eye-tracking/steps/live-controls"
import { CalibrationControls } from "@/features/eye-tracking/steps/calibration-controls"
import { ModelControls } from "@/features/eye-tracking/steps/model-controls"
import { ThresholdControls } from "@/features/eye-tracking/threshold-controls"
import { RegionControls } from "@/features/eye-tracking/steps/region-controls"
import { SourceControls } from "@/features/eye-tracking/steps/source-controls"
import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Eye, X } from "lucide-react"
import { Link } from "react-router-dom"
import { useTracker } from "@/features/eye-tracking/use-tracker"
import { EyePreview } from "@/features/eye-tracking/components/eye-preview"
import type { ManualCornerMode } from "@/features/eye-tracking/components/eye-preview.types"
import { PipelinePreviews } from "@/features/eye-tracking/components/pipeline-previews"
import { V2StepNavigation } from "@/features/eye-tracking/components/v2-step-navigation"
import { V2StepPanel } from "@/features/eye-tracking/components/v2-step-panel"
import { CalibrationOverlay } from "@/features/eye-tracking/calibration-overlay"
import { getEyeModelLockStatus } from "@/features/eye-tracking/eye-model"
import {
  fitCalibration,
  gazeFeature,
  mapGaze,
} from "@/features/eye-tracking/calibration"
import type {
  Calibration,
  CalibrationSample,
  FrameSettings,
  Point,
  Rect,
} from "@/features/eye-tracking/eye-tracking.types"
import type { V2StepCopy, V2StepName } from "./v2-page.types"
import "./v2.css"

const STEPS: readonly V2StepName[] = [
  "Camera",
  "Eye region",
  "Eye model",
  "Calibrate",
  "Live gaze",
]
const COPY: readonly V2StepCopy[] = [
  ["Choose a source", "Choose a USB camera or network stream."],
  ["Frame one eye", "Keep the pupil’s full range of movement inside the box."],
  [
    "Build the eye model",
    "Look left, right, up and down, then around the edges.",
  ],
  [
    "Calibrate your screen",
    "Follow nine points while keeping your head still.",
  ],
  ["Live gaze", "Check your gaze, validate accuracy, or export a result."],
]
export function V2Page({ sceneMode = false }: { sceneMode?: boolean }) {
  const steps: readonly string[] = sceneMode
    ? [
        "Camera",
        "Eye region",
        "Eye model",
        "Scene camera",
        "Finger calibration",
        "Live scene gaze",
      ]
    : STEPS
  const copy = sceneMode
    ? [
        ...COPY.slice(0, 3),
        ["Connect the scene camera", "USB or network stream."],
        [
          "Calibrate with your finger",
          "Look at your physical index fingertip.",
        ],
        ["Live scene gaze", "Map and record your view."],
      ]
    : COPY
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>({
    connected: false,
    calibrated: false,
  })
  const [eyeRevision, setEyeRevision] = useState(0)
  const tracker = useTracker(),
    { settings, configure, source, frame, setPreviewMasksEnabled } = tracker
  const [step, setStep] = useState(0),
    [deviceId, setDeviceId] = useState(""),
    [regionStepComplete, setRegionStepComplete] = useState(false),
    [pipelineOpen, setPipelineOpen] = useState(false),
    [thresholdViewOpen, setThresholdViewOpen] = useState(false)
  const [corner, setCorner] = useState<Point | null>(null),
    [manualCornerMode, setManualCornerMode] = useState<ManualCornerMode | null>(
      null
    ),
    [calibration, setCalibration] = useState<Calibration | null>(null),
    [validation, setValidation] = useState<number | null>(null)
  const [capture, setCapture] = useState<"calibration" | "validation" | null>(
      null
    ),
    [focus, setFocus] = useState(false),
    [notice, setNotice] = useState("")
  let activeCornerMode: ManualCornerMode | null = null
  if (step === 2 && settings.format === "classic" && !settings.locked) {
    activeCornerMode = manualCornerMode
    if (activeCornerMode === null) {
      if (settings.corners) activeCornerMode = "edit"
      else activeCornerMode = "create"
    }
  }
  const clearCalibration = useCallback(() => {
    setEyeRevision((revision) => revision + 1)
    setCalibration(null)
    setValidation(null)
    setCapture(null)
    setFocus(false)
    setNotice("")
  }, [])
  useEffect(() => {
    setPreviewMasksEnabled(
      !!source && (thresholdViewOpen || (pipelineOpen && step >= 2))
    )
  }, [pipelineOpen, setPreviewMasksEnabled, source, step, thresholdViewOpen])
  const update = useCallback(
    (next: Partial<FrameSettings>) => {
      configure(next)
      clearCalibration()
    },
    [configure, clearCalibration]
  )
  const resetSource = () => {
    clearCalibration()
    setRegionStepComplete(false)
    setCorner(null)
    setManualCornerMode(null)
  }
  const usable =
    !!frame?.detection.ellipse &&
    (settings.format === "classic" || frame.detection.tracking === "tracking")
  const modelLockStatus = getEyeModelLockStatus(
    frame?.model ?? null,
    frame?.width ?? 0,
    frame?.height ?? 0,
    frame?.roi.width ?? 0,
    frame?.roi.height ?? 0
  )
  const feature = frame?.gaze ? gazeFeature(frame.gaze.direction) : null
  const screenPoint =
    calibration && feature ? mapGaze(calibration, feature) : null
  const onscreen = screenPoint && screenPoint.every((v) => v >= 0 && v <= 1)
  const allowed = sceneMode
    ? [
        true,
        !!source,
        regionStepComplete && !!source,
        settings.locked && !!source,
        settings.locked && !!source && sceneStatus.connected,
        settings.locked &&
          !!source &&
          sceneStatus.connected &&
          sceneStatus.calibrated,
      ]
    : [
        true,
        !!source,
        regionStepComplete && !!source,
        settings.locked && !!source,
        !!calibration && !!source,
      ]
  let continueDisabled = false
  if (step === 0) {
    continueDisabled = !source
  } else if (step === 2) {
    continueDisabled = !modelLockStatus.ready
  }
  let focusTitle = "Gaze outside this view"
  let stepDescription = copy[step][1]
  if (!screenPoint) {
    focusTitle = "Pupil lost"
  } else if (onscreen) {
    focusTitle = "Look around."
  }
  if (step === 2 && settings.format === "classic") {
    stepDescription =
      "Create two eye-corner points, then use Edit to adjust their spacing."
  }
  const go = (index: number) => {
    if (allowed[index]) {
      setStep(index)
      setNotice("")
    }
  }
  const finishCapture = useCallback(
    (samples: CalibrationSample[]) => {
      setCapture(null)
      if (capture === "validation" && calibration) {
        const mse =
          samples.reduce((sum, s) => {
            const p = mapGaze(calibration, s.feature)!
            return (
              sum +
              ((p[0] - s.target[0]) * window.innerWidth) ** 2 +
              ((p[1] - s.target[1]) * window.innerHeight) ** 2
            )
          }, 0) / samples.length
        setValidation(Math.sqrt(mse))
        setStep(4)
        return
      }
      const fit = fitCalibration(samples)
      if (!fit || fit.validationError > 0.16) {
        setNotice(
          "The samples did not form a reliable mapping. Keep your head still and try again."
        )
        setCalibration(null)
        return
      }
      setCalibration(fit)
      setValidation(null)
      setStep(4)
      setNotice("Calibration saved for this session.")
    },
    [capture, calibration]
  )
  useEffect(() => {
    const resized = () => {
      if (!calibration && !capture && !focus) return
      setStep((current) => Math.min(current, 3))
      setCalibration(null)
      setValidation(null)
      setCapture(null)
      setFocus(false)
      setNotice("Window size changed. Calibrate again for this view.")
    }
    window.addEventListener("resize", resized)
    return () => window.removeEventListener("resize", resized)
  }, [calibration, capture, focus])
  function chooseRegion(roi: Rect) {
    if (
      roi.x === settings.roi.x &&
      roi.y === settings.roi.y &&
      roi.width === settings.roi.width &&
      roi.height === settings.roi.height
    )
      return
    update({ roi, corners: null })
    setStep(1)
    setRegionStepComplete(false)
    setCorner(null)
    setManualCornerMode(null)
  }
  function chooseCorner(point: Point) {
    if (!corner) {
      setCorner(point)
      setNotice("")
      return
    }
    if (Math.hypot(point[0] - corner[0], point[1] - corner[1]) < 12) {
      setNotice("Place the corners farther apart.")
      return
    }
    update({ corners: [corner, point] })
    setCorner(null)
    setManualCornerMode("edit")
  }
  function changeManualCornerMode(mode: ManualCornerMode) {
    if (mode === "edit" && !settings.corners) return
    setCorner(null)
    setNotice("")
    setManualCornerMode(mode)
  }
  function moveCorners(corners: [Point, Point]) {
    update({ corners })
  }
  function exportResult() {
    if (!frame) return
    const data = {
      format: settings.format === "classic" ? "Eye Tracker 1" : "Eye Tracker 2",
      simulated: source?.kind === "sample",
      timestamp: new Date().toISOString(),
      coordinates:
        "camera: +x right, +y down, +z away; screen: normalized viewport",
      settings,
      pupil: frame.detection.ellipse,
      eyeModel: frame.model,
      gaze: frame.gaze,
      screenPosition: screenPoint,
      calibration,
      validationErrorPixels: validation,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    )
    const a = document.createElement("a")
    a.href = url
    a.download = "gazecore-v2-result.json"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <main
      className="eye-app"
      style={{ colorScheme: "dark", backgroundColor: "#090909" }}
    >
      <header className="eye-header">
        <Link to="/dashboard" className="eye-brand">
          <span className="eye-logo">
            <Eye size={21} />
          </span>
          GazeCore
          <span className="eye-version">{sceneMode ? "SCENE" : "V2"}</span>
        </Link>
        <div className="eye-header-right">
          <span className="eye-local">
            <span className="status-light on" />
            On-device processing
          </span>
        </div>
      </header>
      <div className="eye-title-row">
        <div>
          <h1>{sceneMode ? "Scene camera eye tracking" : "Eye tracking"}</h1>
        </div>
        <div className="eye-formats" aria-label="Tracker format">
          {(["classic", "spatial"] as const).map((format, i) => (
            <button
              key={format}
              aria-pressed={settings.format === format}
              onClick={() => {
                if (format === settings.format) return
                update({ format })
                setStep(0)
                setRegionStepComplete(false)
                setCorner(null)
                setManualCornerMode(null)
              }}
            >
              <span>Eye Tracker {i + 1}</span>
              <small>{i === 0 ? "Manual tracker" : "Auto tracker"}</small>
            </button>
          ))}
        </div>
      </div>
      <V2StepNavigation
        steps={steps}
        activeStep={step}
        completedSteps={
          new Set(
            allowed.flatMap((canSelect, index) =>
              canSelect && index < step ? [index] : []
            )
          )
        }
        availableSteps={
          new Set(
            allowed.flatMap((canSelect, index) => (canSelect ? [index] : []))
          )
        }
        onSelectStep={go}
      />
      {sceneMode && (
        <SceneWorkspace
          tracker={tracker}
          step={step - 3}
          onStepChange={(next) => setStep(next + 3)}
          onStatus={setSceneStatus}
          eyeRevision={eyeRevision}
        />
      )}
      <div
        className={`eye-workspace ${sceneMode && step >= 3 ? "scene-eye-diagnostic" : ""}`}
      >
        <section
          className="eye-preview-column"
          aria-label="Eye preview and tuning"
        >
          <ThresholdControls tracker={tracker} update={update} />
          <div
            className={`eye-preview-card ${source ? "has-source" : "is-empty"}`}
          >
            <EyePreview
              tracker={tracker}
              showModel={step >= 2}
              selectRegion={step === 1}
              cornerMode={activeCornerMode}
              pendingCorner={corner}
              onRegion={chooseRegion}
              onCorner={chooseCorner}
              onCornerModeChange={changeManualCornerMode}
              onMoveCorners={moveCorners}
              onMovePendingCorner={setCorner}
              onEditRegion={() => {
                setStep(1)
                setNotice("")
              }}
              onThresholdViewChange={setThresholdViewOpen}
            />
            <details
              className="eye-details eye-pipeline-details"
              hidden={!source || step < 2}
              onToggle={(event) => setPipelineOpen(event.currentTarget.open)}
            >
              <summary>
                {settings.format === "spatial"
                  ? "Threshold comparison"
                  : "Pupil segmentation"}
                <span>
                  {frame?.detection.ellipse
                    ? Math.round(frame.detection.ellipse.confidence * 100) +
                      "% fit"
                    : "No pupil"}
                </span>
              </summary>
              {pipelineOpen && source && step >= 2 && (
                <PipelinePreviews frame={frame} />
              )}
            </details>
          </div>
        </section>
        {(!sceneMode || step < 3) && (
          <V2StepPanel
            stepNumber={step + 1}
            stepName={steps[step]}
            title={copy[step][0]}
            description={stepDescription}
            error={tracker.error}
            message={notice}
          >
            {step === 0 && (
              <SourceControls
                tracker={tracker}
                excludedDeviceId={sceneMode ? sceneStatus.deviceId : undefined}
                deviceId={deviceId}
                setDeviceId={setDeviceId}
                resetSource={resetSource}
              />
            )}
            {step === 1 && (
              <RegionControls tracker={tracker} chooseRegion={chooseRegion} />
            )}
            {step === 2 && (
              <ModelControls
                tracker={tracker}
                corner={corner}
                update={update}
                setNotice={setNotice}
              />
            )}
            {step === 3 && (
              <CalibrationControls
                usable={usable}
                locked={settings.locked}
                onStart={() => {
                  setNotice("")
                  setCapture("calibration")
                }}
              />
            )}
            {step === 4 && (
              <LiveControls
                tracker={tracker}
                calibration={calibration}
                screenPoint={screenPoint}
                validation={validation}
                usable={usable}
                onFocus={() => setFocus(true)}
                onValidate={() => setCapture("validation")}
                onRecalibrate={() => {
                  clearCalibration()
                  setStep(3)
                }}
                onExport={exportResult}
              />
            )}
          </V2StepPanel>
        )}
      </div>
      <footer
        className={`eye-bottom-bar ${step === 2 ? "has-model-status" : ""}`}
      >
        <div>
          {step > 0 && (
            <button
              className="eye-button secondary"
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={15} />
              Back
            </button>
          )}
          {step === 2 && (
            <span
              className="eye-model-lock-status"
              id="eye-model-lock-status"
              role="status"
              aria-live="polite"
            >
              {modelLockStatus.blocker === "waiting" && "Waiting for pupil"}
              {modelLockStatus.blocker === "samples" &&
                `Stable samples ${frame?.model?.samples ?? 0}/30`}
              {modelLockStatus.blocker === "coverage" &&
                `Coverage ${modelLockStatus.coveredDirections}/8 · needs ${modelLockStatus.requiredDirections}`}
              {modelLockStatus.blocker === "radius" &&
                "Look farther from center"}
              {modelLockStatus.blocker === "fit" && "Keep gaze steady"}
              {modelLockStatus.blocker === "ready" && "Model ready"}
            </span>
          )}
          {step < 3 && (
            <button
              className="eye-button primary"
              disabled={continueDisabled}
              aria-describedby={
                step === 2 ? "eye-model-lock-status" : undefined
              }
              onClick={() => {
                if (step === 1) setRegionStepComplete(true)
                if (step === 2) configure({ locked: true }, false)
                setStep((s) => s + 1)
              }}
            >
              {step === 2 ? "Lock model" : "Continue"}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </footer>
      {capture && (
        <CalibrationOverlay
          tracker={tracker}
          validation={capture === "validation"}
          onComplete={finishCapture}
          onCancel={() => setCapture(null)}
        />
      )}
      {focus && (
        <div
          className="eye-focus-view"
          role="dialog"
          aria-modal="true"
          aria-label="Live gaze view"
          onKeyDown={(e) => {
            if (e.key === "Escape") setFocus(false)
          }}
        >
          <button
            autoFocus
            className="eye-icon-button"
            onClick={() => setFocus(false)}
            aria-label="Close gaze view"
          >
            <X />
          </button>
          <div className="eye-focus-caption">
            <span className="eye-eyebrow">
              {source?.kind === "sample" ? "SYNTHETIC SAMPLE" : "LIVE GAZE"}
            </span>
            <h2>{focusTitle}</h2>
            <p>Your gaze dot follows your calibrated screen position.</p>
          </div>
          {onscreen && (
            <i
              className="eye-live-dot"
              style={{
                left: `${screenPoint![0] * 100}%`,
                top: `${screenPoint![1] * 100}%`,
              }}
            />
          )}
        </div>
      )}
    </main>
  )
}
