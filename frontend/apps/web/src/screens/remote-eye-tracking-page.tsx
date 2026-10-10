import { assessValidation } from "@/features/tracking-calibration/validation-assessment"
import { useScreenGeometry } from "@/features/tracking-calibration/use-screen-geometry"
import { useSessionAlignment } from "@/features/tracking-calibration/use-session-alignment"
import {
  RETURN_CHECK_TARGETS,
  PERSONAL_RESIDUAL_TARGETS,
  alignGazePoint,
  evaluatePersonalResidual,
  evaluateReturnCheck,
} from "@/features/tracking-calibration/session-alignment"
import { CalibrationProfileControls } from "@/features/tracking-calibration/calibration-profile-controls"
import { useSavedCalibration } from "@/features/tracking-calibration/use-calibration-profiles"
import { useCameraIdentity } from "@/features/tracking-calibration/use-camera-identity"
import type {
  CalibrationContext,
  CalibrationPayload,
} from "@/features/tracking-calibration/calibration-profiles.types"
import { TrackingBrand } from "@/features/tracking-ui/tracking-brand"
import { GazeBubbleOverlay } from "@/features/gaze-bubble/gaze-bubble-overlay"
import { hasRemoteHeadCompensation } from "@/features/remote-eye-tracking/joint-motion-calibration"
import { CalibratedHeadRange } from "@/features/remote-eye-tracking/components/calibrated-head-range"
import { RemoteValidationSummary } from "@/features/remote-eye-tracking/components/remote-validation-summary"
import { REMOTE_MODES } from "@/features/remote-eye-tracking/components/remote-setup"

import { HeadReadout } from "@/features/remote-eye-tracking/components/head-readout"
import { RemoteModePicker } from "@/features/remote-eye-tracking/components/remote-mode-picker"
import { RemoteSetupProgress } from "@/features/remote-eye-tracking/components/remote-setup-progress"
import { RemoteCameraPreview } from "@/features/remote-eye-tracking/components/remote-camera-preview"
import { RemotePerformanceReadout } from "@/features/remote-eye-tracking/components/remote-performance-readout"
import { RemoteVectorReadout } from "@/features/remote-eye-tracking/components/remote-vector-readout"
import { GazeOffsetControls } from "@/features/eye-tracking/components/gaze-offset-controls"
import { SavedCameraOption } from "@/features/eye-tracking/components/saved-camera-option"
import { applyGazeOffset } from "@/features/eye-tracking/gaze-offset"
import { useCameraSourcePreferences } from "@/features/eye-tracking/use-camera-source-preferences"
import { useGazeAdjustment } from "@/features/eye-tracking/use-gaze-adjustment"
import {
  createRemotePoseSupport,
  evaluateRemoteValidation,
  poseSupported,
  predictRemoteGaze,
  predictRemoteGazeWithoutHeadCorrection,
  remoteFeatureVersion,
} from "@/features/remote-eye-tracking/calibration"
import { RemoteCalibrationOverlay } from "@/features/remote-eye-tracking/calibration-overlay"
import { AdaptiveCalibrationOverlay } from "@/features/remote-eye-tracking/adaptive-calibration-overlay"
import type {
  AdaptiveCalibrationResult,
  AdaptiveHeadCalibration,
} from "@/features/remote-eye-tracking/adaptive-calibration.types"
import { hasRgbBasePoint } from "@/features/remote-eye-tracking/base-point-input"
import { observationStatus } from "@/features/remote-eye-tracking/observation-status"
import {
  Hint,
  IconButton,
  LocalVideoButton,
  SetupHelp,
} from "@/features/remote-eye-tracking/remote-controls"
import type {
  CalibrationSample,
  Point,
  Rect,
  RemoteCalibration,
  RemoteMode,
  ValidationResult,
} from "@/features/remote-eye-tracking/remote-eye-tracking.types"
import { useRemoteTracker } from "@/features/remote-eye-tracking/use-remote-tracker"
import { useRemoteLiveTrace } from "@/features/remote-eye-tracking/use-live-trace"
import {
  ArrowLeft,
  ArrowRight,
  Axis3D,
  Camera,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileVideo,
  Focus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Move3D,
  Play,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  SwitchCamera,
  X,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  EyeAppStyles,
  StatusLightStyles,
} from "../features/tracking-ui/layout-styles"
import { EyeHeaderStyles } from "../features/tracking-ui/head-tracking-styles"
import {
  RemoteActionsStyles,
  RemoteAlertStyles,
  RemoteAppStyles,
  RemoteBottomActionsStyles,
  RemoteCameraPanelStyles,
  RemoteCheckStyles,
  RemoteCheckboxStyles,
  RemoteContentStyles,
  RemoteControlsStyles,
  RemoteFieldLabelStyles,
  RemoteFieldStyles,
  RemoteGoodStyles,
  RemoteHeadPanelStyles,
  RemoteHeaderToolsStyles,
  RemoteIconButtonStyles,
  RemoteLiveStatusStyles,
  RemoteMutedStyles,
  RemotePageHeadingStyles,
  RemotePanelTitleStyles,
  RemotePreviewFooterStyles,
  RemoteSetupHeadingStyles,
  RemoteSummaryStyles,
  RemoteTitleStyles,
  RemoteTooltipStyles,
  RemoteWorkspaceStyles,
} from "../features/tracking-ui/remote-styles"
import type {
  RemoteCaptureKind,
  RemotePreviewDimensions,
} from "./remote-eye-tracking-page.types"
const FULL_ROI: Rect = { x: 0, y: 0, width: 1, height: 1 }
export function RemoteEyeTrackingPage() {
  const screenGeometry = useScreenGeometry()
  const [mode, setMode] = useState<RemoteMode | null>(null)
  const [step, setStep] = useState(0)
  const [advanceAfterStart, setAdvanceAfterStart] = useState(false)
  const { deviceId, setDeviceId } = useCameraSourcePreferences(
    `remote-${mode ?? "webcam"}`
  )
  const [roi, setRoi] = useState<Rect>(FULL_ROI)
  const [threshold, setThreshold] = useState(0)
  const [irRollCompensation, setIrRollCompensation] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [headMovementEnabled, setHeadMovementEnabled] = useState(true)
  const [calibration, setCalibration] = useState<RemoteCalibration | null>(null)
  const { offset, setOffset } = useGazeAdjustment(calibration)
  const { alignment, setAlignment } = useSessionAlignment(calibration)
  const [validationOffset, setValidationOffset] = useState<Point>([0, 0])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validationRequirements, setValidationRequirements] = useState({
    targetCount: 5,
    minimumSamples: 18,
  })
  const [samples, setSamples] = useState<CalibrationSample[]>([])
  const [headSamples, setHeadSamples] = useState<CalibrationSample[]>([])
  const [validationSamples, setValidationSamples] = useState<
    CalibrationSample[]
  >([])
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [capture, setCapture] = useState<RemoteCaptureKind | null>(null)
  const [autoCheck, setAutoCheck] = useState(false)
  const [correctionRequest, setCorrectionRequest] = useState(0)
  const [showGaze, setShowGaze] = useState(false)
  const [showVectors, setShowVectors] = useState(true)
  const [notice, setNotice] = useState("")
  const clearCalibration = useCallback(() => {
    setCalibration(null)
    setValidation(null)
    setCapture(null)
    setAutoCheck(false)
    setShowGaze(false)
    setSamples([])
    setHeadSamples([])
    setValidationSamples([])
  }, [])
  const settings = useMemo(
    () => ({ roi, threshold, irRollCompensation }),
    [roi, threshold, irRollCompensation]
  )
  const {
    state: tracker,
    videoRef,
    latest,
    start: startTracker,
    startVideo,
    stop: stopTracker,
    requestCameraAccess,
    refreshDevices,
  } = useRemoteTracker(settings, () => {
    setAdvanceAfterStart(false)
    setValidation(null)
    setCapture(null)
    setShowGaze(false)
    setStep(1)
    setNotice("Camera paused · calibration kept. Reconnect the same camera.")
  })
  const selected = REMOTE_MODES.find((item) => item.id === mode)
  const replaying = tracker.source === "video"
  const ready = tracker.status === "ready"
  const invalidateCalibration = useCallback(() => {
    clearCalibration()
    let nextStep = 1
    if (ready) {
      nextStep = 3
    }
    setStep(nextStep)
    setNotice(ready && !replaying ? "Setup changed. Calibrate again." : "")
  }, [clearCalibration, ready, replaying])
  const observation = tracker.observation
  const valid =
    ready &&
    !!observation?.feature &&
    !observation.reason &&
    observation.quality >= 0.45
  const calibrationSignalReady =
    valid && (!observation?.baseModelVersion || hasRgbBasePoint(observation))
  const activeCalibration = ready && !replaying ? calibration : null
  if (advanceAfterStart && ready) {
    setAdvanceAfterStart(false)
    setStep(calibration ? 5 : 3)
  }
  const cameraIdentity = useCameraIdentity(tracker.cameraDeviceId ?? deviceId)
  let observedVersion = calibration?.featureVersion ?? ""
  if (observation?.feature) {
    observedVersion = remoteFeatureVersion(observation)
  }
  const [lastFeatureVersion, setLastFeatureVersion] = useState("")
  if (observedVersion && lastFeatureVersion !== observedVersion) {
    setLastFeatureVersion(observedVersion)
  }
  const featureVersion = observedVersion || lastFeatureVersion
  const inputWidth = observation?.width ?? 0
  const inputHeight = observation?.height ?? 0
  const profileContext = useMemo<CalibrationContext | null>(() => {
    if (
      !mode ||
      !ready ||
      replaying ||
      !cameraIdentity ||
      inputWidth <= 0 ||
      inputHeight <= 0 ||
      !featureVersion
    ) {
      return null
    }
    return {
      version: 1,
      tracker: mode,
      featureVersion,
      cameraIdentity,
      width: inputWidth,
      height: inputHeight,
      inputTransform: "camera-raw",
      outputSpace: "screen",
      screenAspect: screenGeometry.aspectRatio,
      setupKey: JSON.stringify({
        roi,
        irRollCompensation,
        viewport: [screenGeometry.width, screenGeometry.height],
      }),
      geometryId: null,
    }
  }, [
    mode,
    ready,
    replaying,
    cameraIdentity,
    featureVersion,
    inputWidth,
    inputHeight,
    roi,
    irRollCompensation,
    screenGeometry.width,
    screenGeometry.height,
    screenGeometry.aspectRatio,
  ])
  const profilePayload = useMemo<CalibrationPayload | null>(
    () => (calibration ? { kind: "remote", model: calibration } : null),
    [calibration]
  )
  const profiles = useSavedCalibration({
    context: profileContext,
    payload: profilePayload,
    offset,
    alignment,
    ready,
    disabled: !!capture || replaying,
    onIncompatible: invalidateCalibration,
    onLoaded: (payload, savedOffset, savedAlignment) => {
      if (payload.kind !== "remote") {
        return
      }
      setCalibration(payload.model)
      setOffset(savedOffset, payload.model)
      setAlignment(savedAlignment, payload.model)
      setSamples([])
      setHeadSamples([])
      setValidationSamples([])
      setValidation(null)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setShowGaze(true)
      setStep(5)
    },
  })
  const supported =
    !activeCalibration ||
    poseSupported(activeCalibration, observation?.pose ?? null)
  const checkedPoseSupport = useMemo(() => {
    if (!calibration || validationSamples.length === 0) {
      return null
    }
    const measured = validationSamples.filter(
      (sample) => predictRemoteGaze(calibration, sample.observation) !== null
    )
    return {
      ...calibration,
      ...createRemotePoseSupport(measured),
      headCorrection: undefined,
      motionFit: undefined,
    }
  }, [calibration, validationSamples])
  const withinCheckedPose =
    checkedPoseSupport !== null &&
    poseSupported(checkedPoseSupport, observation?.pose ?? null, "validation")
  const mappedPoint =
    activeCalibration && observation
      ? predictRemoteGaze(activeCalibration, observation)
      : null
  const point = applyGazeOffset(alignGazePoint(mappedPoint, alignment), offset)
  const liveTrace = useRemoteLiveTrace({
    calibration: activeCalibration,
    alignment,
    offset,
    width: screenGeometry.width,
    height: screenGeometry.height,
    enabled: ready && !capture,
    observation,
    mappedPoint,
    screenPoint: point,
  })
  const beforeHeadCorrection =
    activeCalibration && !activeCalibration.motionFit && observation
      ? predictRemoteGazeWithoutHeadCorrection(activeCalibration, observation)
      : null
  const adjustedSinceValidation =
    validation !== null &&
    offset.some((value, index) => value !== validationOffset[index])
  useEffect(() => {
    const referenceWidth = calibration ? viewport.width : window.innerWidth
    const referenceHeight = calibration ? viewport.height : window.innerHeight
    const invalidate = () => {
      if (
        !mode ||
        capture ||
        (window.innerWidth === referenceWidth &&
          window.innerHeight === referenceHeight)
      ) {
        return
      }
      invalidateCalibration()
    }
    const hidden = () => {
      if (document.hidden && mode) {
        setCapture(null)
        setShowGaze(false)
      }
    }
    window.addEventListener("resize", invalidate)
    document.addEventListener("visibilitychange", hidden)
    // Capture can end while resized even when saved profiles are unavailable.
    invalidate()
    return () => {
      window.removeEventListener("resize", invalidate)
      document.removeEventListener("visibilitychange", hidden)
    }
  }, [
    mode,
    capture,
    calibration,
    viewport.width,
    viewport.height,
    invalidateCalibration,
  ])
  function choose(next: RemoteMode) {
    setAdvanceAfterStart(false)
    stopTracker()
    clearCalibration()
    setMode(next)
    setStep(1)
    setRoi(FULL_ROI)
    setThreshold(0)
    setNotice("")
  }
  function start() {
    if (!mode) {
      return
    }
    setValidation(null)
    setAutoCheck(false)
    setCapture(null)
    setShowGaze(false)
    setNotice("")
    void startTracker(mode, deviceId || undefined)
    // Starting a replacement stream synchronously stops the old session first.
    setAdvanceAfterStart(true)
  }
  function inspectVideo(file: File) {
    if (!mode) {
      return
    }
    clearCalibration()
    setAdvanceAfterStart(false)
    setSelecting(false)
    setNotice("")
    void startVideo(mode, file)
    setStep(3)
  }
  function stop() {
    setAdvanceAfterStart(false)
    setAutoCheck(false)
    stopTracker()
    setCapture(null)
    setShowGaze(false)
    setValidation(null)
    setStep(1)
  }
  function returnToCameraChoices() {
    setAdvanceAfterStart(false)
    stopTracker()
    clearCalibration()
    setSelecting(false)
    setDragStart(null)
    setNotice("")
    setStep(0)
    setMode(null)
  }
  function goToPreviousStep() {
    if (step === 1) {
      returnToCameraChoices()
      return
    }
    goToStep(step === 3 ? 1 : step - 1)
  }
  const allowedSteps = [0]
  if (mode) {
    allowedSteps.push(1)
  }
  if (ready) {
    allowedSteps.push(3)
  }
  if (activeCalibration) {
    allowedSteps.push(4, 5)
  }
  function goToStep(nextStep: number) {
    if (!allowedSteps.includes(nextStep)) {
      return
    }
    if (nextStep === 0) {
      returnToCameraChoices()
      return
    }
    setAdvanceAfterStart(false)
    setCapture(null)
    setAutoCheck(false)
    setShowGaze(false)
    setNotice("")
    setStep(nextStep)
  }
  function finishCapture(
    collected: CalibrationSample[],
    dimensions: RemotePreviewDimensions,
    attempts?: CalibrationSample[]
  ) {
    setCapture(null)
    setAutoCheck(false)
    setShowGaze(false)
    if (replaying) {
      return
    }
    if (capture === "repair" && calibration) {
      const readings = (attempts ?? collected).map((sample) => ({
        timestamp: sample.observation.timestamp,
        targetId: sample.targetId,
        target: sample.target,
        point: predictRemoteGaze(calibration, sample.observation),
        reason: sample.observation.reason,
      }))
      const repaired = evaluatePersonalResidual(
        readings,
        dimensions,
        !!profileContext
      )
      if (!repaired.alignment) {
        setNotice(repaired.issue)
        return
      }
      setAlignment(repaired.alignment)
      setOffset([0, 0])
      setValidation(null)
      setStep(4)
      setNotice("Grid repaired · validate before use")
    } else if (capture === "check" && calibration) {
      const readings = (attempts ?? collected).map((sample) => ({
        timestamp: sample.observation.timestamp,
        targetId: sample.targetId,
        target: sample.target,
        point: applyGazeOffset(
          alignGazePoint(
            predictRemoteGaze(calibration, sample.observation),
            alignment
          ),
          offset
        ),
        reason: sample.observation.reason,
      }))
      const checked = evaluateReturnCheck(readings, dimensions)
      if (
        !checked.offset ||
        checked.metrics.rmsPixels === null ||
        checked.metrics.meanPixels === null ||
        checked.metrics.p95Pixels === null ||
        checked.metrics.jitterPixels === null
      ) {
        setValidation(
          evaluateRemoteValidation(
            calibration,
            attempts ?? collected,
            dimensions.width,
            dimensions.height,
            offset,
            alignment
          )
        )
        setValidationOffset([...offset])
        setValidationRequirements({ targetCount: 3, minimumSamples: 4 })
        setValidationSamples(attempts ?? collected)
        setStep(5)
        setNotice(checked.issue)
        return
      }
      const correctedOffset: Point = [
        offset[0] + checked.offset[0],
        offset[1] + checked.offset[1],
      ]
      if (correctedOffset.some((value) => Math.abs(value) > 1)) {
        setValidation(null)
        setNotice("Correction is outside the supported range. Recalibrate.")
        return
      }
      setValidationRequirements({ targetCount: 3, minimumSamples: 4 })
      setOffset(correctedOffset)
      setValidationOffset(correctedOffset)
      setValidation({
        ...checked.metrics,
        rmsPixels: checked.metrics.rmsPixels,
        meanPixels: checked.metrics.meanPixels,
        p95Pixels: checked.metrics.p95Pixels,
        jitterPixels: checked.metrics.jitterPixels,
      })
      setValidationSamples(collected)
      setStep(5)
      setNotice(
        checked.corrected
          ? "Offset corrected · check complete"
          : "Check complete"
      )
    } else if (calibration) {
      const result = evaluateRemoteValidation(
        calibration,
        attempts ?? collected,
        dimensions.width,
        dimensions.height,
        offset,
        alignment
      )
      setValidationRequirements({ targetCount: 5, minimumSamples: 18 })
      setValidationOffset([...offset])
      setValidation(result)
      setValidationSamples(attempts ?? collected)
      setStep(5)
      setNotice(
        result
          ? ""
          : "Check incomplete · no usable gaze readings. Your calibration is kept."
      )
    }
  }
  function finishAdaptiveCalibration(result: AdaptiveCalibrationResult): void {
    setCapture(null)
    setHeadSamples(result.headSamples)
    if (capture === "head" && !result.headCorrectionUpdated) {
      setNotice(
        "This head hold did not improve the mapping. Existing calibration kept."
      )
      return
    }
    setShowGaze(false)
    setCalibration(result.model)
    if (capture === "head") {
      setOffset(offset, result.model)
      setAlignment(alignment, result.model)
    }
    setSamples(result.samples)
    setValidationSamples([])
    setViewport(result.viewport)
    setValidationOffset([0, 0])
    setValidation(result.validation)
    setValidationRequirements({ targetCount: 5, minimumSamples: 18 })
    setStep(5)
    setAutoCheck(true)
    setCapture("validate")
    setNotice("")
    if (headMovementEnabled && !result.headMovementLearned) {
      setNotice(
        "Calibration saved for this session. No additional head correction was learned."
      )
    }
  }

  function exportResults() {
    const result = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      mode,
      method: observation?.method,
      viewport,
      camera: { width: observation?.width, height: observation?.height },
      calibration,
      validation,
      samples,
      headSamples,
      validationSamples,
      gazeOffset: offset,
      sessionAlignment: alignment,
      validationOffset,
      accuracyVerified,
      screenPosition: point,
      liveTrace: liveTrace.read(),
      liveTraceCoordinates:
        "Mapped model output and aligned/offset screen coordinates before display smoothing; last 20 seconds, at most 10 readings per second. No video frames are retained.",
      trackingVectors: observation?.vectors ?? null,
      trackingVectorTimestamp: observation?.timestamp ?? null,
      headCorrectionComparison: {
        before: beforeHeadCorrection,
        after: mappedPoint,
        active: hasRemoteHeadCompensation(activeCalibration),
        kind: activeCalibration?.motionFit ? "joint-motion" : "residual",
      },
      coordinates:
        "Normalized screen position; no physical 3D gaze ray or angular accuracy is inferred.",
      headTracking:
        calibration?.poseKind === "eye-reference"
          ? "Corneal-reference translation and apparent scale; rotation is unavailable."
          : "Face rotation, normalized image position, and apparent scale; included per sample.",
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `gazecore-remote-${mode}-result.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function pointerPosition(event: React.PointerEvent<HTMLDivElement>): Point {
    const box = event.currentTarget.getBoundingClientRect()
    return [
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    ]
  }
  const assessment = assessValidation(
    validation,
    viewport,
    validationRequirements.targetCount,
    validationRequirements.minimumSamples
  )
  const accuracyVerified =
    assessment.status === "checked" &&
    !adjustedSinceValidation &&
    supported &&
    withinCheckedPose
  let startLabel = ready ? "Restart camera" : "Start camera"
  if (tracker.status === "loading") {
    startLabel = "Starting camera"
  }
  let StartIcon = ready ? RefreshCcw : Play
  if (tracker.status === "loading") {
    StartIcon = LoaderCircle
  }
  const signalLabel =
    observationStatus(observation?.reason) ??
    (replaying ? "Waiting for a video frame" : "Waiting for camera")
  const referenceTracking =
    mode === "ir" &&
    (observation?.pose?.kind === "eye-reference" ||
      observation?.method === "IR pupil / corneal reflection" ||
      roi.width < 1 ||
      roi.height < 1)
  let DiscoveryIcon = LockKeyhole
  if (tracker.cameraAccess === "granted") {
    DiscoveryIcon = RefreshCcw
  }
  if (tracker.cameraAccess === "requesting") {
    DiscoveryIcon = LoaderCircle
  }
  let headLabel = replaying ? "Recorded head tracking" : "Live head tracking"
  if (referenceTracking) {
    headLabel = "Eye reference tracking"
  }
  const previousStepLabel =
    step === 1 ? "Back to camera choices" : "Previous step"
  const adaptiveCapture = capture === "calibrate" || capture === "head"
  let headCalibration: AdaptiveHeadCalibration | undefined
  if (capture === "head" && calibration) {
    headCalibration = { model: calibration, samples, viewport }
  }
  return (
    <main className={`eye-app ${EyeAppStyles} remote-app ${RemoteAppStyles}`}>
      <header className={`eye-header ${EyeHeaderStyles}`}>
        <TrackingBrand version="REMOTE" />
        <div className={`remote-header-tools ${RemoteHeaderToolsStyles}`}>
          <Hint label="On-device processing">
            <ShieldCheck size={18} />
          </Hint>
          <SetupHelp preparation={selected?.preparation} />
        </div>
      </header>
      <div className={`remote-content ${RemoteContentStyles}`}>
        <div className={`remote-title ${RemoteTitleStyles}`}>
          <div className={`remote-page-heading ${RemotePageHeadingStyles}`}>
            {step === 0 ? (
              <Link
                className={`remote-icon-button ${RemoteIconButtonStyles}`}
                href="/dashboard"
                aria-label="Dashboard"
              >
                <ArrowLeft size={18} />
                <span
                  className={`remote-tooltip ${RemoteTooltipStyles}`}
                  aria-hidden="true"
                >
                  Dashboard
                </span>
              </Link>
            ) : (
              <IconButton
                label={previousStepLabel}
                icon={ArrowLeft}
                onClick={goToPreviousStep}
              />
            )}
            <h1>Remote eye tracking</h1>
          </div>
          <RemoteSetupProgress
            step={step}
            replaying={replaying}
            allowedSteps={allowedSteps}
            onStepChange={goToStep}
          />
        </div>
        {step === 0 && <RemoteModePicker onChoose={choose} />}
        {step > 0 && selected && (
          <div className={`remote-setup-heading ${RemoteSetupHeadingStyles}`}>
            <span>
              <selected.icon size={18} />
              {selected.short}
            </span>
            <div className={`remote-actions ${RemoteActionsStyles}`}>
              <LocalVideoButton onSelect={inspectVideo} />
              {replaying && (
                <IconButton label="Stop video" icon={Square} onClick={stop} />
              )}
              <IconButton
                label="Change setup"
                icon={SwitchCamera}
                onClick={returnToCameraChoices}
              />
            </div>
          </div>
        )}
        <div
          className={`remote-workspace ${RemoteWorkspaceStyles}`}
          hidden={step === 0}
        >
          <section
            className={`remote-camera-panel ${RemoteCameraPanelStyles}`}
            aria-label="Camera preview"
          >
            <div className={`remote-panel-title ${RemotePanelTitleStyles}`}>
              <Hint
                label={
                  replaying
                    ? `Local video: ${tracker.sourceName}`
                    : "Camera preview"
                }
              >
                {replaying ? <FileVideo size={16} /> : <Camera size={16} />}
              </Hint>
              <div className="flex items-center gap-3">
                <IconButton
                  label={
                    showVectors
                      ? "Hide tracking vectors"
                      : "Show tracking vectors"
                  }
                  icon={Axis3D}
                  className="[&.remote-icon-button_.remote-tooltip]:right-0 [&.remote-icon-button_.remote-tooltip]:[left:auto]"
                  aria-pressed={showVectors}
                  onClick={() => setShowVectors((visible) => !visible)}
                />
                <RemotePerformanceReadout
                  fps={tracker.fps}
                  ready={ready}
                  status={tracker.status}
                  observation={observation}
                />
              </div>
            </div>
            <RemoteCameraPreview
              observation={observation}
              showVectors={showVectors}
              mode={mode}
              roi={roi}
              replaying={replaying}
              selecting={selecting}
              status={tracker.status}
              videoRef={videoRef}
              onPointerDown={(event) => {
                if (!selecting) {
                  return
                }
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragStart(pointerPosition(event))
              }}
              onPointerUp={(event) => {
                if (!selecting || !dragStart) {
                  return
                }
                const end = pointerPosition(event)
                const next = {
                  x: Math.min(end[0], dragStart[0]),
                  y: Math.min(end[1], dragStart[1]),
                  width: Math.abs(end[0] - dragStart[0]),
                  height: Math.abs(end[1] - dragStart[1]),
                }
                if (next.width > 0.03 && next.height > 0.03) {
                  setRoi(next)
                  clearCalibration()
                  setNotice("Eye region changed. Calibrate again.")
                }
                setDragStart(null)
                setSelecting(false)
              }}
            />
            <div
              className={`remote-preview-footer ${RemotePreviewFooterStyles}`}
            >
              <Hint label={valid ? "Eye signal available" : signalLabel}>
                <Eye
                  size={15}
                  className={
                    valid
                      ? `remote-good ${RemoteGoodStyles}`
                      : `remote-muted ${RemoteMutedStyles}`
                  }
                />
                <span>{valid ? "Ready" : "No signal"}</span>
              </Hint>
              <span>
                {observation
                  ? `${observation.width} × ${observation.height}`
                  : ""}
              </span>
            </div>
            <div className={`remote-head-panel ${RemoteHeadPanelStyles}`}>
              <Hint label={headLabel}>
                <Move3D size={18} />
              </Hint>
              <HeadReadout
                pose={observation?.pose ?? null}
                reference={referenceTracking}
              />
            </div>
            {showVectors && (
              <RemoteVectorReadout
                vectors={observation?.vectors ?? null}
                beforeHeadCorrection={beforeHeadCorrection}
                afterHeadCorrection={mappedPoint}
                headCorrectionActive={hasRemoteHeadCompensation(
                  activeCalibration
                )}
                jointMotion={Boolean(activeCalibration?.motionFit)}
              />
            )}
          </section>
          <section className={`remote-controls ${RemoteControlsStyles}`}>
            {tracker.error && (
              <div
                className={`remote-alert ${RemoteAlertStyles} error`}
                role="alert"
              >
                {tracker.error}
              </div>
            )}
            {notice && (
              <div
                className={`remote-alert ${RemoteAlertStyles}`}
                role="status"
              >
                {notice}
              </div>
            )}
            {step === 1 && (
              <>
                <h2>Camera</h2>
                <p>
                  {tracker.cameraAccess === "granted"
                    ? "Select a camera."
                    : "Allow access to choose a camera."}
                </p>
                <label className={`remote-field ${RemoteFieldStyles}`}>
                  <span
                    className={`remote-field-label ${RemoteFieldLabelStyles}`}
                  >
                    <Camera size={14} />
                    Camera
                  </span>
                  <select
                    aria-label="Camera"
                    disabled={
                      tracker.cameraAccess === "requesting" ||
                      tracker.status === "loading"
                    }
                    value={deviceId}
                    onChange={(event) => {
                      setDeviceId(event.target.value)
                      setAdvanceAfterStart(false)
                      stopTracker()
                      clearCalibration()
                    }}
                  >
                    <option value="">
                      Default {mode === "mobile" ? "front camera" : "camera"}
                    </option>
                    <SavedCameraOption
                      deviceId={deviceId}
                      devices={tracker.devices}
                    />
                    {tracker.devices.map((device, i) => (
                      <option
                        key={device.deviceId || i}
                        value={device.deviceId}
                        disabled={!device.deviceId}
                      >
                        {device.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
                {tracker.cameraAccess === "requesting" && (
                  <p className={`remote-muted ${RemoteMutedStyles}`}>
                    Allow camera access in your browser.
                  </p>
                )}
                {tracker.cameraError && (
                  <div
                    className={`remote-alert ${RemoteAlertStyles} error`}
                    role="alert"
                  >
                    {tracker.cameraError}
                  </div>
                )}
                <div className={`remote-actions ${RemoteActionsStyles}`}>
                  <IconButton
                    label={
                      tracker.cameraAccess === "granted"
                        ? "Refresh cameras"
                        : "Discover cameras"
                    }
                    icon={DiscoveryIcon}
                    disabled={
                      tracker.cameraAccess === "requesting" ||
                      tracker.status === "loading"
                    }
                    onClick={() => {
                      void (tracker.cameraAccess === "granted"
                        ? refreshDevices()
                        : requestCameraAccess())
                    }}
                  />
                  {tracker.cameraAccess === "requesting" && (
                    <IconButton
                      label="Cancel camera access"
                      icon={X}
                      onClick={stop}
                    />
                  )}
                  <IconButton
                    label={startLabel}
                    icon={StartIcon}
                    primary={!ready}
                    disabled={
                      tracker.status === "loading" ||
                      tracker.cameraAccess === "requesting"
                    }
                    onClick={start}
                  />
                  {(ready || tracker.status === "loading") && (
                    <IconButton
                      label="Stop camera"
                      icon={Square}
                      onClick={stop}
                    />
                  )}
                  <IconButton
                    label={
                      calibration ? "Resume results" : "Continue to calibration"
                    }
                    icon={ArrowRight}
                    primary={ready}
                    disabled={!ready}
                    onClick={() => {
                      if (calibration) {
                        setStep(5)
                        return
                      }
                      setStep(3)
                    }}
                  />
                </div>
              </>
            )}
            {step === 3 && (mode === "ir" || replaying) && (
              <>
                {replaying && <h2>Recording</h2>}
                {replaying && (
                  <p>
                    Inspect pupils and head pose. Use the video controls to
                    play, pause, or seek.
                  </p>
                )}
                {mode === "ir" && (
                  <div className="remote-ir-controls">
                    <div className={`remote-actions ${RemoteActionsStyles}`}>
                      <IconButton
                        label={
                          selecting
                            ? "Cancel region selection"
                            : "Select close-up eye region"
                        }
                        icon={Focus}
                        aria-pressed={selecting}
                        onClick={() => setSelecting((value) => !value)}
                      />
                      <IconButton
                        label="Automatic eye regions"
                        icon={RefreshCcw}
                        onClick={() => {
                          setRoi(FULL_ROI)
                          clearCalibration()
                        }}
                      />
                    </div>
                    {selecting && (
                      <p className={`remote-muted ${RemoteMutedStyles}`}>
                        Drag around one eye.
                      </p>
                    )}
                    <label
                      className={`remote-checkbox ${RemoteCheckboxStyles}`}
                    >
                      <input
                        type="checkbox"
                        aria-label="Automatic threshold"
                        checked={threshold === 0}
                        onChange={(event) => {
                          setThreshold(event.target.checked ? 0 : 80)
                          clearCalibration()
                        }}
                      />
                      <Sparkles size={16} />
                      <span>Auto threshold</span>
                    </label>
                    {threshold !== 0 && (
                      <label className={`remote-field ${RemoteFieldStyles}`}>
                        <span
                          className={`remote-field-label ${RemoteFieldLabelStyles}`}
                        >
                          <SlidersHorizontal size={14} />
                          Threshold <span>{threshold}</span>
                        </span>
                        <input
                          aria-label="Pupil threshold"
                          type="range"
                          min="1"
                          max="255"
                          value={threshold}
                          onChange={(event) => {
                            setThreshold(Number(event.target.value))
                            clearCalibration()
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
                {mode === "ir" && (
                  <label
                    className={`remote-checkbox ${RemoteCheckboxStyles}`}
                    title="Experimental camera-axis roll features. Requires new calibration; accuracy still needs device validation."
                  >
                    <input
                      type="checkbox"
                      checked={irRollCompensation}
                      aria-label="Trial IR roll compensation"
                      onChange={(event) => {
                        setIrRollCompensation(event.target.checked)
                        clearCalibration()
                      }}
                    />
                    <Move3D size={16} aria-hidden="true" />
                    <span>Trial roll</span>
                  </label>
                )}
                <div className={`remote-check ${RemoteCheckStyles}`}>
                  <span
                    className={`status-light ${StatusLightStyles} ${valid ? "on" : ""}`}
                  />
                  {valid ? "Eyes detected" : signalLabel}
                </div>
                {replaying && (
                  <p className={`remote-muted ${RemoteMutedStyles}`}>
                    Recorded frames have no screen targets, so screen
                    calibration is unavailable.
                  </p>
                )}
              </>
            )}
            {step >= 3 && !replaying && (
              <CalibrationProfileControls
                controller={profiles}
                sceneLabels={false}
              />
            )}
            {step === 3 && !replaying && (
              <>
                <h2>Calibration</h2>
                <p>Follow the dot.</p>
                {calibration && (
                  <IconButton
                    label="Preview current calibration"
                    icon={Eye}
                    onClick={() => setStep(5)}
                  />
                )}
                <label
                  className={`remote-checkbox ${RemoteCheckboxStyles}`}
                  title="After 9 dots, one center hold learns head-motion error while you keep looking at the same point."
                >
                  <input
                    type="checkbox"
                    aria-label="Include head movement"
                    checked={headMovementEnabled}
                    onChange={(event) =>
                      setHeadMovementEnabled(event.target.checked)
                    }
                  />
                  <Move3D size={18} />
                  <span>Head compensation</span>
                </label>
                <div className={`remote-actions ${RemoteActionsStyles}`}>
                  <Hint label="9 setup dots covering the center, corners and edges">
                    <Crosshair size={16} />
                    <span>9</span>
                  </Hint>
                  <IconButton
                    label="Start calibration"
                    icon={Play}
                    primary
                    disabled={!calibrationSignalReady}
                    onClick={() => {
                      setCapture("calibrate")
                      setShowGaze(false)
                    }}
                  />
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <h2>Validation</h2>
                <IconButton
                  label="Quick check · 3 comfortable dots"
                  icon={Crosshair}
                  disabled={!valid || !activeCalibration}
                  onClick={() => setCapture("check")}
                />
                <IconButton
                  label="Trial grid repair · 5 inset dots over this calibration"
                  icon={RefreshCcw}
                  disabled={!valid || !activeCalibration || !profileContext}
                  onClick={() => setCapture("repair")}
                />
                <p>Follow 5 new targets.</p>
                {calibration && (
                  <div className={`remote-summary ${RemoteSummaryStyles}`}>
                    <Hint
                      label={`${calibration.sampleCount} synchronized samples`}
                    >
                      <Layers3 size={16} />
                      <span>{calibration.sampleCount}</span>
                    </Hint>
                    <Hint label={`${calibration.targetCount} screen locations`}>
                      <Crosshair size={16} />
                      <span>{calibration.targetCount}</span>
                    </Hint>
                  </div>
                )}
                <div className={`remote-actions ${RemoteActionsStyles}`}>
                  <IconButton
                    label="Validate gaze"
                    icon={Play}
                    primary
                    disabled={!valid || !activeCalibration}
                    onClick={() => setCapture("validate")}
                  />
                  <IconButton
                    label="Use unverified preview"
                    icon={Eye}
                    disabled={!activeCalibration}
                    onClick={() => setStep(5)}
                  />
                  <IconButton
                    label="Repeat calibration"
                    icon={RefreshCcw}
                    onClick={() => {
                      setStep(3)
                    }}
                  />
                </div>
              </>
            )}
            {step === 5 && calibration && (
              <>
                <RemoteValidationSummary
                  validation={validation}
                  adjustedSinceValidation={adjustedSinceValidation}
                  outsideCheckedPose={!withinCheckedPose}
                  assessment={assessment}
                />
                {!supported && (
                  <div
                    className={`remote-alert ${RemoteAlertStyles}`}
                    role="status"
                  >
                    Outside the measured head range · accuracy may be lower.
                  </div>
                )}
                <GazeOffsetControls
                  onCorrect={() => {
                    setShowGaze(true)
                    setCorrectionRequest((value) => value + 1)
                  }}
                  offset={offset}
                  width={viewport.width}
                  height={viewport.height}
                  onChange={setOffset}
                />
                <div className={`remote-live-status ${RemoteLiveStatusStyles}`}>
                  <span
                    className={`status-light ${StatusLightStyles} ${point ? "on" : ""}`}
                  />
                  {point
                    ? `${(point[0] * 100).toFixed(1)}%, ${(point[1] * 100).toFixed(1)}%`
                    : "Paused"}
                </div>
                <div className={`remote-actions ${RemoteActionsStyles}`}>
                  <IconButton
                    label={showGaze ? "Hide gaze dot" : "Show live gaze"}
                    icon={showGaze ? EyeOff : Eye}
                    primary
                    aria-pressed={showGaze}
                    onClick={() => setShowGaze((value) => !value)}
                  />
                  <IconButton
                    label="Validate adjustment"
                    icon={Crosshair}
                    disabled={!valid}
                    onClick={() => setCapture("validate")}
                  />
                  <IconButton
                    label="Trial grid repair · 5 inset dots over this calibration"
                    icon={RefreshCcw}
                    disabled={!valid || !profileContext}
                    onClick={() => setCapture("repair")}
                  />
                  <IconButton
                    label="Export results"
                    icon={Download}
                    onClick={exportResults}
                  />
                  <IconButton
                    label="Learn head correction · center dot only"
                    icon={Move3D}
                    disabled={!calibrationSignalReady}
                    onClick={() => setCapture("head")}
                  />
                </div>
                {calibration && (
                  <CalibratedHeadRange calibration={calibration} />
                )}
              </>
            )}
            {step > 1 && (
              <div
                className={`remote-bottom-actions ${RemoteBottomActionsStyles}`}
              >
                <IconButton
                  label="Previous step"
                  icon={ArrowLeft}
                  onClick={goToPreviousStep}
                />
                <IconButton label="Stop camera" icon={Square} onClick={stop} />
              </div>
            )}
          </section>
        </div>
      </div>
      {adaptiveCapture && ready && !replaying && mode && (
        <AdaptiveCalibrationOverlay
          mode={mode}
          latest={latest}
          headMovement={headMovementEnabled}
          headCalibration={headCalibration}
          onComplete={finishAdaptiveCalibration}
          onCancel={() => {
            setCapture(null)
            setNotice("Capture canceled. Your previous calibration is kept.")
          }}
        />
      )}
      {capture && !adaptiveCapture && ready && !replaying && (
        <RemoteCalibrationOverlay
          key={capture}
          autoStart={capture === "validate" && autoCheck}
          latest={latest}
          captureViewport={viewport}
          targets={capture === "check" ? RETURN_CHECK_TARGETS : undefined}
          repairTargets={
            capture === "repair" ? PERSONAL_RESIDUAL_TARGETS : undefined
          }
          comfortableHold={capture === "check" || capture === "repair"}
          calibration={activeCalibration}
          onComplete={finishCapture}
          onCancel={() => {
            setCapture(null)
            setAutoCheck(false)
            setNotice("Capture canceled.")
          }}
        />
      )}
      {showGaze && !capture && (
        <GazeBubbleOverlay
          correction={
            activeCalibration
              ? { onChange: setOffset, request: correctionRequest }
              : undefined
          }
          stabilize={false}
          profile={mode === "ir" ? undefined : "remote-adaptive"}
          point={point}
          timestamp={observation?.timestamp ?? null}
          errorRadiusPx={
            adjustedSinceValidation ? null : (validation?.p95Pixels ?? null)
          }
          verified={accuracyVerified}
          resetKey={activeCalibration}
          offset={offset}
          markerClassName="remote-live-dot"
        />
      )}
    </main>
  )
}
