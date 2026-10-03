import { TrackingBrand } from "@/features/tracking-ui/tracking-brand"
import { mapCalibrationSample } from "@/features/eye-tracking/calibration"
import { CalibrationDiagnostics } from "@/features/eye-tracking/calibration-diagnostics"
import type { DiagnosticReadingInput } from "@/features/eye-tracking/calibration-diagnostics.types"
import { fitCalibrationInWorker } from "@/features/eye-tracking/calibration-fit"
import {
  DEFAULT_GAZE_ORIENTATION,
  SAMPLE_GAZE_ORIENTATION,
} from "@/features/eye-tracking/calibration-orientation"
import { CalibrationOverlay } from "@/features/eye-tracking/calibration-overlay"
import type {
  CalibrationFitIssue,
  CalibrationFitResult,
} from "@/features/eye-tracking/calibration-result.types"
import type { GazeOrientation } from "@/features/eye-tracking/calibration.types"
import { EyePreview } from "@/features/eye-tracking/components/eye-preview"
import type { ManualCornerMode } from "@/features/eye-tracking/components/eye-preview.types"
import { EyeTooltipLayer } from "@/features/eye-tracking/components/eye-tooltip-layer"
import { PipelinePreviews } from "@/features/eye-tracking/components/pipeline-previews"
import { SetupStepNavigation } from "@/features/eye-tracking/components/setup-step-navigation"
import { SetupStepPanel } from "@/features/eye-tracking/components/setup-step-panel"
import { getEyeModelLockStatus } from "@/features/eye-tracking/eye-model"
import type {
  Calibration,
  CalibrationSample,
  FrameSettings,
  Point,
  Rect,
} from "@/features/eye-tracking/eye-tracking.types"
import { applyGazeOffset } from "@/features/eye-tracking/gaze-offset"
import { HeadControls } from "@/features/eye-tracking/head-tracking/head-controls"
import { HeadPreview } from "@/features/eye-tracking/head-tracking/head-preview"
import { useHeadTracking } from "@/features/eye-tracking/head-tracking/use-head-tracking"
import { LiveGazeOverlay } from "@/features/eye-tracking/live-gaze-overlay"
import { CalibrationControls } from "@/features/eye-tracking/steps/calibration-controls"
import { LiveControls } from "@/features/eye-tracking/steps/live-controls"
import { ModelControls } from "@/features/eye-tracking/steps/model-controls"
import { RegionControls } from "@/features/eye-tracking/steps/region-controls"
import { SourceControls } from "@/features/eye-tracking/steps/source-controls"
import { ThresholdControls } from "@/features/eye-tracking/threshold-controls"
import { useCalibratedGaze } from "@/features/eye-tracking/use-calibrated-gaze"
import { useGazeAdjustment } from "@/features/eye-tracking/use-gaze-adjustment"
import { useTracker } from "@/features/eye-tracking/use-tracker"
import {
  SceneWorkspace,
  type SceneStatus,
} from "@/features/scene-eye-tracking/scene-workspace"
import { ArrowLeft, ArrowRight, Eye, ScanEye } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  EyeAppStyles,
  EyeBottomBarStyles,
  EyeFormatsStyles,
  EyeLocalStyles,
  EyePreviewCardStyles,
  EyePreviewColumnStyles,
  EyeTitleRowStyles,
  EyeWorkspaceStyles,
  StatusLightStyles,
} from "../features/tracking-ui/layout-styles"
import {
  EyeButtonStyles,
  EyeDetailsStyles,
} from "../features/tracking-ui/control-styles"
import {
  EyeHeaderRightStyles,
  EyeHeaderStyles,
} from "../features/tracking-ui/head-tracking-styles"
import {
  EyeModelLockStatusStyles,
  EyePipelineDetailsStyles,
} from "../features/tracking-ui/camera-styles"
import { RemoteTrialLinkStyles } from "../features/tracking-ui/remote-styles"
import type {
  EyeTrackingWorkspaceProps,
  SetupStepName,
} from "./eye-tracking-workspace.types"
const STEPS: readonly SetupStepName[] = [
  "Camera",
  "Eye region",
  "Eye model",
  "Head tracker",
  "Calibrate",
  "Live gaze",
]
const STEP_HELP: readonly string[] = [
  "Connect a USB camera or network stream. Processing stays in this browser.",
  "Frame one eye. Keep the pupil’s full movement inside the box, with dark frame edges outside.",
  "Look left, right, up and down, then around the edges to build the eye model.",
  "Optional: connect a front camera. Calibration includes a short head-movement pass.",
  "Look at each dot until it pops, then follow the next one. Keep your face visible if head tracking is enabled.",
  "Check your gaze, validate accuracy, recalibrate, or export a result.",
]
const SCENE_STEPS = [
  "Camera",
  "Eye region",
  "Eye model",
  "Scene camera",
  "Calibration",
  "Live scene gaze",
] as const
const SCENE_STEP_HELP = [
  ...STEP_HELP.slice(0, 3),
  "Connect and orient the outward scene camera.",
  "Choose a hand, marker, or one-point reference to calibrate the scene.",
  "View, adjust, and record scene gaze.",
] as const
export function EyeTrackingWorkspace({
  sceneMode = false,
}: EyeTrackingWorkspaceProps) {
  const steps = sceneMode ? SCENE_STEPS : STEPS
  const stepHelp = sceneMode ? SCENE_STEP_HELP : STEP_HELP
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>({
    connected: false,
    calibrated: false,
  })
  const [eyeRevision, setEyeRevision] = useState(0)
  const [diagnostics] = useState(() => new CalibrationDiagnostics())
  const [diagnosticsAvailable, setDiagnosticsAvailable] = useState(false)
  const recordDiagnosticReading = useCallback(
    (reading: DiagnosticReadingInput) => {
      diagnostics.recordReading(reading)
      setDiagnosticsAvailable(true)
    },
    [diagnostics]
  )
  const pendingFit = useRef<AbortController | null>(null)
  const [fitting, setFitting] = useState(false)
  useEffect(() => () => pendingFit.current?.abort(), [])
  const tracker = useTracker()
  const { settings, configure, source, frame, setPreviewMasksEnabled } = tracker
  const head = useHeadTracking(!sceneMode && !!source)
  const [orientation, setOrientation] = useState<GazeOrientation>(
    DEFAULT_GAZE_ORIENTATION
  )
  let activeOrientation = orientation
  if (source?.kind === "sample") {
    activeOrientation = SAMPLE_GAZE_ORIENTATION
  }
  const [step, setStep] = useState(0)
  const [regionStepComplete, setRegionStepComplete] = useState(false)
  const [pipelineOpen, setPipelineOpen] = useState(false)
  const [thresholdViewOpen, setThresholdViewOpen] = useState(false)
  const [corner, setCorner] = useState<Point | null>(null)
  const [manualCornerMode, setManualCornerMode] =
    useState<ManualCornerMode | null>(null)
  const [calibration, setCalibration] = useState<Calibration | null>(null)
  const [validation, setValidation] = useState<number | null>(null)
  const [capture, setCapture] = useState<"calibration" | "validation" | null>(
    null
  )
  const [focus, setFocus] = useState(false)
  const [notice, setNotice] = useState("")
  const [savedGazeGrid, setSavedGazeGrid] = useState<CalibrationSample[]>([])
  const [headCalibrationIssue, setHeadCalibrationIssue] =
    useState<CalibrationFitIssue | null>(null)
  const [retryHeadPass, setRetryHeadPass] = useState(false)
  let activeCornerMode: ManualCornerMode | null = null
  if (step === 2 && settings.format === "classic" && !settings.locked) {
    activeCornerMode = manualCornerMode
    if (activeCornerMode === null) {
      if (settings.corners) {
        activeCornerMode = "edit"
      } else {
        activeCornerMode = "create"
      }
    }
  }
  const resetCalibrationState = useCallback(() => {
    setEyeRevision((revision) => revision + 1)
    setFitting(false)
    setCalibration(null)
    setValidation(null)
    setCapture(null)
    setFocus(false)
    setNotice("")
    setSavedGazeGrid([])
    setHeadCalibrationIssue(null)
    setRetryHeadPass(false)
    setDiagnosticsAvailable(false)
  }, [])
  const clearCalibration = useCallback(() => {
    pendingFit.current?.abort()
    diagnostics.clear()
    resetCalibrationState()
  }, [diagnostics, resetCalibrationState])
  const geometry = `${tracker.dimensions.width}:${tracker.dimensions.height}:${source?.key ?? ""}`
  const [calibrationGeometry, setCalibrationGeometry] = useState(geometry)
  if (calibrationGeometry !== geometry) {
    setCalibrationGeometry(geometry)
    resetCalibrationState()
  }
  useEffect(() => {
    pendingFit.current?.abort()
    diagnostics.clear()
  }, [diagnostics, geometry])
  useEffect(() => {
    setPreviewMasksEnabled(
      !!source &&
        (!sceneMode || step < 3) &&
        (thresholdViewOpen || (pipelineOpen && step >= 2))
    )
  }, [
    pipelineOpen,
    sceneMode,
    setPreviewMasksEnabled,
    source,
    step,
    thresholdViewOpen,
  ])
  const update = useCallback(
    (next: Partial<FrameSettings>) => {
      configure(next)
      clearCalibration()
    },
    [configure, clearCalibration]
  )
  const resetSource = () => {
    head.stop()
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
  const gazeReading = useCalibratedGaze({
    calibration,
    eye: tracker.latest,
    head: head.latest,
    headHistory: head.history,
    onDiagnosticReading: recordDiagnosticReading,
  })
  const { offset, setOffset } = useGazeAdjustment(calibration)
  const screenPoint = applyGazeOffset(gazeReading.point, offset)
  const onscreen = screenPoint && screenPoint.every((v) => v >= 0 && v <= 1)
  let allowed = [
    true,
    !!source,
    regionStepComplete && !!source,
    settings.locked && !!source,
    settings.locked &&
      !!source &&
      (!head.enabled || head.status === "tracking"),
    !!calibration && !!source,
  ]
  if (sceneMode) {
    allowed = [
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
  }
  let eyeDeviceId = ""
  if (source?.kind === "camera") {
    const activeCamera = tracker.devices.find(
      (device) => device.label === source.name
    )
    eyeDeviceId = source.deviceId || activeCamera?.deviceId || ""
  }
  let continueDisabled = false
  if (step === 0) {
    continueDisabled = !source
  } else if (step === 2) {
    continueDisabled = !modelLockStatus.ready
  } else if (step === 3) {
    continueDisabled = head.enabled && head.status !== "tracking"
  }
  let focusTitle = "Gaze outside this view"
  let stepDescription = stepHelp[step]
  if (!screenPoint) {
    focusTitle = gazeReading.message
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
    async (samples: CalibrationSample[]) => {
      if (capture === "validation" && calibration) {
        setCapture(null)
        const mse =
          samples.reduce((sum, s) => {
            const p = applyGazeOffset(
              mapCalibrationSample(calibration, s),
              offset
            )
            if (!p) {
              return Infinity
            }
            return (
              sum +
              ((p[0] - s.target[0]) * window.innerWidth) ** 2 +
              ((p[1] - s.target[1]) * window.innerHeight) ** 2
            )
          }, 0) / samples.length
        if (!Number.isFinite(mse)) {
          setNotice(
            "Validation lost the face or left the calibrated head range. Please retry."
          )
          return
        }
        setValidation(Math.sqrt(mse))
        setStep(5)
        return
      }
      pendingFit.current?.abort()
      const controller = new AbortController()
      pendingFit.current = controller
      setFitting(true)
      const request = {
        samples,
        orientation: activeOrientation,
        screenAspectRatio: window.innerWidth / window.innerHeight,
      }
      const attempt = diagnostics.startFit(request)
      setDiagnosticsAvailable(true)
      let result: CalibrationFitResult
      try {
        result = await fitCalibrationInWorker(request, controller.signal)
      } catch (error) {
        if (controller.signal.aborted) {
          diagnostics.finishFit(attempt, null, "Calibration cancelled.")
          return
        }
        let message = "Calibration failed. Please retry."
        if (error instanceof Error) {
          message = error.message
        }
        diagnostics.finishFit(attempt, null, message)
        setNotice(message)
        setCapture(null)
        setFitting(false)
        pendingFit.current = null
        return
      }
      if (controller.signal.aborted) {
        return
      }
      diagnostics.finishFit(attempt, result)
      pendingFit.current = null
      setCapture(null)
      setFitting(false)
      setRetryHeadPass(false)
      if (!result.calibration) {
        setNotice(result.issue?.message ?? "Calibration could not be fitted.")
        return
      }
      setCalibration(result.calibration)
      setSavedGazeGrid(samples.slice(0, 9))
      setHeadCalibrationIssue(result.issue)
      setValidation(null)
      setStep(5)
      if (result.issue) {
        setNotice(`Eye-only calibration saved. ${result.issue.message}`)
      } else {
        setNotice("Calibration saved for this session.")
      }
    },
    [capture, calibration, activeOrientation, diagnostics, offset]
  )
  const canRetryHead =
    head.enabled &&
    !!calibration &&
    !calibration.headCompensation &&
    !!headCalibrationIssue &&
    savedGazeGrid.length === 9
  function retryHeadCalibration(): void {
    setFocus(false)
    setNotice("")
    setRetryHeadPass(true)
    setCapture("calibration")
  }
  useEffect(() => {
    const resized = () => {
      if (!calibration && !capture && !focus) {
        return
      }
      setStep((current) => Math.min(current, 4))
      clearCalibration()
      setNotice("Window size changed. Calibrate again for this view.")
    }
    window.addEventListener("resize", resized)
    return () => window.removeEventListener("resize", resized)
  }, [calibration, capture, focus, clearCalibration])
  function chooseRegion(roi: Rect) {
    if (
      roi.x === settings.roi.x &&
      roi.y === settings.roi.y &&
      roi.width === settings.roi.width &&
      roi.height === settings.roi.height
    ) {
      return
    }
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
    if (mode === "edit" && !settings.corners) {
      return
    }
    setCorner(null)
    setNotice("")
    setManualCornerMode(mode)
  }
  function moveCorners(corners: [Point, Point]) {
    update({ corners })
  }
  function exportResult() {
    if (!frame && !diagnosticsAvailable) {
      return
    }
    const data = {
      format: settings.format === "classic" ? "Eye Tracker 1" : "Eye Tracker 2",
      simulated: source?.kind === "sample",
      timestamp: new Date().toISOString(),
      coordinates:
        "camera: +x right, +y down, +z away; screen: normalized viewport",
      settings,
      pupil: frame?.detection.ellipse ?? null,
      eyeModel: frame?.model ?? null,
      gaze: frame?.gaze ?? null,
      screenPosition: screenPoint,
      gazeOffset: offset,
      calibration,
      headPose: head.latest.current,
      validationErrorPixels: validation,
      headCameraTransform: head.transform,
      eyeCameraOrientation: activeOrientation,
      eyeSourceKind: source?.kind ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      diagnostics: diagnostics.snapshot(),
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
      className={
        sceneMode
          ? `eye-app ${EyeAppStyles} scene-mode`
          : `eye-app ${EyeAppStyles}`
      }
    >
      <EyeTooltipLayer />
      <header className={`eye-header ${EyeHeaderStyles}`}>
        <TrackingBrand version={sceneMode ? "SCENE" : "SCREEN"} />
        <div className={`eye-header-right ${EyeHeaderRightStyles}`}>
          <Link
            href="/trial/remote-eye-tracking"
            className={`remote-trial-link ${RemoteTrialLinkStyles}`}
          >
            Remote eye tracking
          </Link>
          <span className={`eye-local ${EyeLocalStyles}`}>
            <span className={`status-light ${StatusLightStyles} on`} />
            On-device processing
          </span>
        </div>
      </header>
      <div className={`eye-title-row ${EyeTitleRowStyles}`}>
        <div>
          <h1>
            {sceneMode ? "Scene camera eye tracking" : "Screen eye tracking"}
          </h1>
        </div>
        <div
          className={`eye-formats ${EyeFormatsStyles}`}
          aria-label="Tracker format"
        >
          {(["classic", "spatial"] as const).map((format, i) => (
            <button
              key={format}
              aria-label={`Eye Tracker ${i + 1}: ${i === 0 ? "Manual" : "Auto"} tracking`}
              title={i === 0 ? "Manual eye model" : "Automatic eye model"}
              aria-pressed={settings.format === format}
              onClick={() => {
                if (format === settings.format) {
                  return
                }
                update({ format })
                setStep(0)
                setRegionStepComplete(false)
                setCorner(null)
                setManualCornerMode(null)
              }}
            >
              {i === 0 ? (
                <Eye size={16} aria-hidden="true" />
              ) : (
                <ScanEye size={16} aria-hidden="true" />
              )}
              <span>{i === 0 ? "Manual" : "Auto"}</span>
            </button>
          ))}
        </div>
      </div>
      <SetupStepNavigation
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
        className={`eye-workspace ${EyeWorkspaceStyles}`}
        hidden={sceneMode && step >= 3}
      >
        <section
          className={`eye-preview-column ${EyePreviewColumnStyles}`}
          aria-label="Eye preview and tuning"
        >
          <ThresholdControls tracker={tracker} update={update} />
          <div
            className={`eye-preview-card ${EyePreviewCardStyles} ${source ? "has-source" : "is-empty"}`}
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
              transformDisabled={sceneStatus.recording}
              onTransformChange={() => {
                resetSource()
                setStep(1)
                setNotice(
                  "Camera orientation changed. Select the eye region and rebuild the eye model."
                )
              }}
            />
            <details
              className={`eye-details ${EyeDetailsStyles} eye-pipeline-details ${EyePipelineDetailsStyles}`}
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
          <SetupStepPanel
            stepName={steps[step]}
            description={stepDescription}
            error={tracker.error}
            message={notice}
          >
            {head.enabled && step !== 3 && !capture && !focus && (
              <HeadPreview head={head} inline />
            )}
            {step === 0 && (
              <SourceControls
                tracker={tracker}
                excludedDeviceId={sceneMode ? sceneStatus.deviceId : undefined}
                role={sceneMode ? "scene-eye" : "eye"}
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
              <HeadControls
                head={head}
                devices={tracker.devices}
                eyeDeviceId={eyeDeviceId}
                simulated={source?.kind === "sample"}
                onConfigurationChange={clearCalibration}
                onSkip={() => {
                  head.stop()
                  clearCalibration()
                  setStep(4)
                }}
              />
            )}
            {step === 4 && (
              <CalibrationControls
                usable={usable}
                locked={settings.locked}
                headReady={!head.enabled || head.status === "tracking"}
                headEnabled={head.enabled}
                onExportDiagnostics={
                  diagnosticsAvailable ? exportResult : undefined
                }
                orientation={activeOrientation}
                onOrientationChange={(next) => {
                  clearCalibration()
                  setOrientation(next)
                }}
                onStart={() => {
                  setNotice("")
                  setRetryHeadPass(false)
                  setCapture("calibration")
                }}
              />
            )}
            {step === 5 && (
              <LiveControls
                tracker={tracker}
                calibration={calibration}
                screenPoint={screenPoint}
                validation={validation}
                usable={usable}
                gazeMessage={gazeReading.message}
                headCompensated={!!calibration?.headCompensation}
                onRetryHeadCalibration={
                  canRetryHead ? retryHeadCalibration : undefined
                }
                retryHeadDisabled={head.status !== "tracking"}
                onFocus={() => setFocus(true)}
                onValidate={() => setCapture("validation")}
                onRecalibrate={() => {
                  clearCalibration()
                  setStep(4)
                }}
                offset={offset}
                onOffsetChange={(value) => {
                  setOffset(value)
                  setValidation(null)
                }}
                onExport={exportResult}
              />
            )}
          </SetupStepPanel>
        )}
      </div>
      <footer
        className={`eye-bottom-bar ${EyeBottomBarStyles} ${step === 2 ? "has-model-status" : ""}`}
      >
        <div>
          {step > 0 && (
            <button
              className={`eye-button ${EyeButtonStyles} secondary`}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={15} />
              Back
            </button>
          )}
          {step === 2 && (
            <span
              className={`eye-model-lock-status ${EyeModelLockStatusStyles}`}
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
          {(step < 3 || (!sceneMode && step === 3)) && (
            <button
              className={`eye-button ${EyeButtonStyles} primary`}
              disabled={continueDisabled}
              aria-describedby={
                step === 2 ? "eye-model-lock-status" : undefined
              }
              onClick={() => {
                if (step === 1) {
                  setRegionStepComplete(true)
                }
                if (step === 2) {
                  configure({ locked: true }, false)
                }
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
          head={head}
          calibration={calibration}
          validation={capture === "validation"}
          fitting={fitting}
          seedSamples={retryHeadPass ? savedGazeGrid : undefined}
          orientation={activeOrientation}
          onComplete={finishCapture}
          onDiagnosticReading={recordDiagnosticReading}
          onCancel={() => {
            pendingFit.current?.abort()
            setFitting(false)
            setCapture(null)
          }}
        />
      )}
      {focus && (
        <LiveGazeOverlay
          point={screenPoint}
          timestamp={gazeReading.timestamp ?? null}
          validationErrorPixels={validation}
          resetKey={calibration}
          offset={offset}
          title={focusTitle}
          simulated={source?.kind === "sample"}
          head={head}
          onClose={() => setFocus(false)}
        />
      )}
    </main>
  )
}
