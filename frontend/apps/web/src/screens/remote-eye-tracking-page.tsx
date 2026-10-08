import { TrackingBrand } from "@/features/tracking-ui/tracking-brand"
import { GazeBubbleOverlay } from "@/features/gaze-bubble/gaze-bubble-overlay"
import { CalibratedHeadRange } from "@/features/remote-eye-tracking/components/calibrated-head-range"
import { RemoteValidationSummary } from "@/features/remote-eye-tracking/components/remote-validation-summary"
import { REMOTE_MODES } from "@/features/remote-eye-tracking/components/remote-setup"

import { HeadReadout } from "@/features/remote-eye-tracking/components/head-readout"
import { RemoteModePicker } from "@/features/remote-eye-tracking/components/remote-mode-picker"
import { RemoteSetupProgress } from "@/features/remote-eye-tracking/components/remote-setup-progress"
import { RemoteCameraPreview } from "@/features/remote-eye-tracking/components/remote-camera-preview"
import { GazeOffsetControls } from "@/features/eye-tracking/components/gaze-offset-controls"
import { SavedCameraOption } from "@/features/eye-tracking/components/saved-camera-option"
import { applyGazeOffset } from "@/features/eye-tracking/gaze-offset"
import { useCameraSourcePreferences } from "@/features/eye-tracking/use-camera-source-preferences"
import { useGazeAdjustment } from "@/features/eye-tracking/use-gaze-adjustment"
import {
  evaluateRemoteValidation,
  fitRemoteCalibration,
  poseSupported,
  predictRemoteGaze,
} from "@/features/remote-eye-tracking/calibration"
import { RemoteCalibrationOverlay } from "@/features/remote-eye-tracking/calibration-overlay"
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
import {
  ArrowLeft,
  ArrowRight,
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
import { useEffect, useMemo, useState } from "react"
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
  RemoteCameraStatusStyles,
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
import type { RemotePreviewDimensions } from "./remote-eye-tracking-page.types"
const FULL_ROI: Rect = { x: 0, y: 0, width: 1, height: 1 }
export function RemoteEyeTrackingPage() {
  const [mode, setMode] = useState<RemoteMode | null>(null)
  const [step, setStep] = useState(0)
  const { deviceId, setDeviceId } = useCameraSourcePreferences(
    `remote-${mode ?? "webcam"}`
  )
  const [roi, setRoi] = useState<Rect>(FULL_ROI)
  const [threshold, setThreshold] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [extended, setExtended] = useState(true)
  const [calibration, setCalibration] = useState<RemoteCalibration | null>(null)
  const { offset, setOffset } = useGazeAdjustment(calibration)
  const [validationOffset, setValidationOffset] = useState<Point>([0, 0])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [samples, setSamples] = useState<CalibrationSample[]>([])
  const [validationSamples, setValidationSamples] = useState<
    CalibrationSample[]
  >([])
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [capture, setCapture] = useState<"calibrate" | "validate" | null>(null)
  const [correctionRequest, setCorrectionRequest] = useState(0)
  const [showGaze, setShowGaze] = useState(false)
  const [notice, setNotice] = useState("")
  function clearCalibration() {
    setCalibration(null)
    setValidation(null)
    setCapture(null)
    setShowGaze(false)
    setSamples([])
    setValidationSamples([])
  }
  const settings = useMemo(() => ({ roi, threshold }), [roi, threshold])
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
    clearCalibration()
    setStep(1)
  })
  const selected = REMOTE_MODES.find((item) => item.id === mode)
  const replaying = tracker.source === "video"
  const ready = tracker.status === "ready"
  const observation = tracker.observation
  const valid =
    ready &&
    !!observation?.feature &&
    !observation.reason &&
    observation.quality >= 0.45
  const activeCalibration = ready && !replaying ? calibration : null
  const supported =
    !activeCalibration ||
    poseSupported(activeCalibration, observation?.pose ?? null)
  const mappedPoint =
    activeCalibration && observation
      ? predictRemoteGaze(activeCalibration, observation)
      : null
  const point = applyGazeOffset(mappedPoint, offset)
  const adjustedSinceValidation = offset.some(
    (value, index) => value !== validationOffset[index]
  )
  useEffect(() => {
    const invalidate = () => {
      if (!mode) {
        return
      }
      clearCalibration()
      let nextStep = 1
      if (replaying) {
        nextStep = 2
      } else if (ready) {
        nextStep = 3
      }
      setStep(nextStep)
      setNotice(ready && !replaying ? "Screen changed. Calibrate again." : "")
    }
    const hidden = () => {
      if (document.hidden && mode) {
        invalidate()
        setStep(1)
      }
    }
    window.addEventListener("resize", invalidate)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      window.removeEventListener("resize", invalidate)
      document.removeEventListener("visibilitychange", hidden)
    }
  }, [ready, mode, replaying])
  function choose(next: RemoteMode) {
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
    clearCalibration()
    setNotice("")
    void startTracker(mode, deviceId || undefined)
  }
  function inspectVideo(file: File) {
    if (!mode) {
      return
    }
    clearCalibration()
    setSelecting(false)
    setNotice("")
    void startVideo(mode, file)
    setStep(2)
  }
  function stop() {
    stopTracker()
    clearCalibration()
    setStep(1)
  }
  function returnToCameraChoices() {
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
    setCapture(null)
    setShowGaze(false)
    setNotice("")
    setStep(step - 1)
  }
  function finishCapture(
    collected: CalibrationSample[],
    dimensions: RemotePreviewDimensions
  ) {
    setCapture(null)
    setShowGaze(false)
    if (replaying) {
      return
    }
    if (capture === "calibrate" && mode) {
      const fitted = fitRemoteCalibration(mode, collected)
      if (!fitted) {
        setNotice("Calibration failed. Adjust framing or lighting and retry.")
        return
      }
      setCalibration(fitted)
      setSamples(collected)
      setViewport(dimensions)
      setValidation(null)
      setStep(4)
      setNotice("")
    } else if (calibration) {
      const result = evaluateRemoteValidation(
        calibration,
        collected,
        dimensions.width,
        dimensions.height,
        offset
      )
      if (!result || result.targetCount !== 5) {
        setNotice(
          "Validation incomplete. Return to your calibrated position and retry."
        )
        return
      }
      setValidationOffset([...offset])
      setValidation(result)
      setValidationSamples(collected)
      setStep(5)
      setNotice("")
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
      validationSamples,
      gazeOffset: offset,
      validationOffset,
      screenPosition: point,
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
  const diagonal = Math.hypot(viewport.width, viewport.height)
  const needsCalibration =
    validation && diagonal > 0 && validation.meanPixels > diagonal * 0.08
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
  let positionHelp = "Keep both eyes visible. Move your head gently."
  if (mode === "ir") {
    positionHelp = "Keep your face visible. Eye regions are automatic."
  }
  if (replaying) {
    positionHelp =
      "Inspect pupils and head pose. Use the video controls to play, pause, or seek."
  }
  const previousStepLabel =
    step === 1 ? "Back to camera choices" : "Previous step"
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
          <RemoteSetupProgress step={step} replaying={replaying} />
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
              <span
                className={`remote-camera-status ${RemoteCameraStatusStyles}`}
              >
                <span
                  className={`status-light ${StatusLightStyles} ${ready ? "on" : ""}`}
                />
                {ready ? `${tracker.fps.toFixed(0)} fps` : tracker.status}
              </span>
            </div>
            <RemoteCameraPreview
              observation={observation}
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
                    label="Check your position"
                    icon={ArrowRight}
                    primary={ready}
                    disabled={!ready}
                    onClick={() => setStep(2)}
                  />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2>{replaying ? "Recording" : "Position"}</h2>
                <p>{positionHelp}</p>
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
                <div className={`remote-check ${RemoteCheckStyles}`}>
                  <span
                    className={`status-light ${StatusLightStyles} ${valid ? "on" : ""}`}
                  />
                  {valid ? "Eyes detected" : signalLabel}
                </div>
                <IconButton
                  label="Continue to calibration"
                  icon={ArrowRight}
                  primary
                  disabled={!valid || replaying}
                  onClick={() => {
                    if (!replaying) {
                      setStep(3)
                    }
                  }}
                />
                {replaying && (
                  <p className={`remote-muted ${RemoteMutedStyles}`}>
                    Recorded frames have no screen targets, so screen
                    calibration is unavailable.
                  </p>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h2>Calibration</h2>
                <p>Follow the dot.</p>
                <label className={`remote-checkbox ${RemoteCheckboxStyles}`}>
                  <input
                    type="checkbox"
                    aria-label="Include head movement"
                    checked={extended}
                    onChange={(event) => setExtended(event.target.checked)}
                  />
                  <Move3D size={18} />
                  <span>Head movement</span>
                </label>
                <div className={`remote-actions ${RemoteActionsStyles}`}>
                  <Hint label={`${extended ? 18 : 9} calibration targets`}>
                    <Crosshair size={16} />
                    <span>{extended ? 18 : 9}</span>
                  </Hint>
                  <IconButton
                    label={`Start ${extended ? 18 : 9}-target calibration`}
                    icon={Play}
                    primary
                    disabled={!valid}
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
                    label="Repeat calibration"
                    icon={RefreshCcw}
                    onClick={() => {
                      clearCalibration()
                      setStep(3)
                    }}
                  />
                </div>
              </>
            )}
            {step === 5 && validation && (
              <>
                <RemoteValidationSummary
                  validation={validation}
                  adjustedSinceValidation={adjustedSinceValidation}
                  needsCalibration={Boolean(needsCalibration)}
                />
                {!supported && (
                  <div
                    className={`remote-alert ${RemoteAlertStyles}`}
                    role="status"
                  >
                    Head moved beyond calibration. Recalibrate.
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
                    label="Export results"
                    icon={Download}
                    onClick={exportResults}
                  />
                  <IconButton
                    label="Recalibrate with head movement"
                    icon={RefreshCcw}
                    onClick={() => {
                      setExtended(true)
                      clearCalibration()
                      setStep(3)
                    }}
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
      {capture && ready && !replaying && (
        <RemoteCalibrationOverlay
          latest={latest}
          extended={extended}
          calibration={capture === "validate" ? activeCalibration : null}
          onComplete={finishCapture}
          onCancel={() => {
            setCapture(null)
            setNotice("Capture canceled. Keep the screen fixed and retry.")
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
          point={point}
          timestamp={observation?.timestamp ?? null}
          errorRadiusPx={
            adjustedSinceValidation ? null : (validation?.p95Pixels ?? null)
          }
          verified={!!validation && !adjustedSinceValidation}
          resetKey={activeCalibration}
          offset={offset}
          markerClassName="remote-live-dot"
        />
      )}
    </main>
  )
}
