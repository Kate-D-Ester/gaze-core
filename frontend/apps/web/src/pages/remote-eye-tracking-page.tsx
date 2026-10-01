import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Focus,
  FileVideo,
  Gauge,
  Layers3,
  LockKeyhole,
  Sparkles,
  LoaderCircle,
  Maximize2,
  Move3D,
  MoveHorizontal,
  MoveVertical,
  Play,
  RefreshCcw,
  RotateCw,
  ScanEye,
  ScanFace,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Square,
  SwitchCamera,
  X,
} from "lucide-react"
import {
  Hint,
  IconButton,
  LocalVideoButton,
  SetupHelp,
} from "@/features/remote-eye-tracking/remote-controls"
import { RemoteCalibrationOverlay } from "@/features/remote-eye-tracking/calibration-overlay"
import {
  evaluateRemoteValidation,
  fitRemoteCalibration,
  poseSupported,
  predictRemoteGaze,
} from "@/features/remote-eye-tracking/calibration"
import { observationStatus } from "@/features/remote-eye-tracking/observation-status"
import { useRemoteTracker } from "@/features/remote-eye-tracking/use-remote-tracker"
import type {
  CalibrationSample,
  HeadPose,
  Point,
  Rect,
  RemoteCalibration,
  RemoteMode,
  ValidationResult,
} from "@/features/remote-eye-tracking/types"
import "./v2.css"
import "./remote-eye-tracking.css"

const MODES = [
  {
    id: "mobile" as const,
    title: "Mobile eye tracker",
    short: "Mobile",
    icon: Smartphone,
    hint: "Track with your phone’s selfie camera.",
    preparation: "Rest your phone on a support. Keep both eyes visible.",
  },
  {
    id: "webcam" as const,
    title: "Webcam-based eye tracker",
    short: "Webcam",
    icon: Camera,
    hint: "Use a laptop or USB webcam.",
    preparation: "Place the camera above your screen. Keep both eyes visible.",
  },
  {
    id: "ir" as const,
    title: "IR webcam-based eye tracker",
    short: "IR camera",
    icon: ScanEye,
    hint: "Automatically locate eyes and measure IR pupils.",
    preparation:
      "Keep your face visible. Eyes and pupil thresholds are automatic.",
  },
]
const STEPS = [
  { label: "Choose", icon: SwitchCamera },
  { label: "Camera", icon: Camera },
  { label: "Position", icon: ScanFace },
  { label: "Calibrate", icon: Crosshair },
  { label: "Validate", icon: CheckCircle2 },
  { label: "Results", icon: Gauge },
]
const FULL_ROI: Rect = { x: 0, y: 0, width: 1, height: 1 }
function degrees(value: number | null) {
  return value === null ? "—" : `${Math.round((value * 180) / Math.PI)}°`
}
function percentage(value: number | undefined, precision = 0) {
  return value === undefined ? "—" : `${(value * 100).toFixed(precision)}%`
}
function HeadReadout({
  pose,
  reference,
}: {
  pose: HeadPose | null
  reference: boolean
}) {
  const isFace = !reference
  const values = [
    {
      label: isFace ? "Yaw" : "Reference X",
      icon: MoveHorizontal,
      value: isFace ? degrees(pose?.yaw ?? null) : percentage(pose?.x),
    },
    {
      label: isFace ? "Pitch" : "Reference Y",
      icon: MoveVertical,
      value: isFace ? degrees(pose?.pitch ?? null) : percentage(pose?.y),
    },
    {
      label: isFace ? "Roll" : "Eye scale",
      icon: isFace ? RotateCw : Maximize2,
      value: isFace ? degrees(pose?.roll ?? null) : percentage(pose?.scale, 1),
    },
  ]
  return (
    <div className="remote-head-readout">
      {values.map((item) => (
        <Hint key={item.label} label={`${item.label}: ${item.value}`}>
          <item.icon size={15} aria-hidden="true" />
          <strong>{item.value}</strong>
        </Hint>
      ))}
    </div>
  )
}
export function RemoteEyeTrackingPage() {
  const [mode, setMode] = useState<RemoteMode | null>(null)
  const [step, setStep] = useState(0)
  const [deviceId, setDeviceId] = useState("")
  const [roi, setRoi] = useState<Rect>(FULL_ROI)
  const [threshold, setThreshold] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [extended, setExtended] = useState(true)
  const [calibration, setCalibration] = useState<RemoteCalibration | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [samples, setSamples] = useState<CalibrationSample[]>([])
  const [validationSamples, setValidationSamples] = useState<
    CalibrationSample[]
  >([])
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [capture, setCapture] = useState<"calibrate" | "validate" | null>(null)
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
  const selected = MODES.find((item) => item.id === mode)
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
  const point =
    activeCalibration && observation
      ? predictRemoteGaze(activeCalibration, observation)
      : null

  useEffect(() => {
    const invalidate = () => {
      if (!mode) return
      clearCalibration()
      let nextStep = 1
      if (replaying) nextStep = 2
      else if (ready) nextStep = 3
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
    setDeviceId("")
    setRoi(FULL_ROI)
    setThreshold(0)
    setNotice("")
  }
  function start() {
    if (!mode) return
    clearCalibration()
    setNotice("")
    void startTracker(mode, deviceId || undefined)
  }
  function inspectVideo(file: File) {
    if (!mode) return
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
  function finishCapture(
    collected: CalibrationSample[],
    dimensions: { width: number; height: number }
  ) {
    setCapture(null)
    setShowGaze(false)
    if (replaying) return
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
        dimensions.height
      )
      if (!result || result.targetCount !== 5) {
        setNotice(
          "Validation incomplete. Return to your calibrated position and retry."
        )
        return
      }
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
  if (tracker.status === "loading") startLabel = "Starting camera"
  let StartIcon = ready ? RefreshCcw : Play
  if (tracker.status === "loading") StartIcon = LoaderCircle
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
  if (tracker.cameraAccess === "granted") DiscoveryIcon = RefreshCcw
  if (tracker.cameraAccess === "requesting") DiscoveryIcon = LoaderCircle
  let headLabel = replaying ? "Recorded head tracking" : "Live head tracking"
  if (referenceTracking) headLabel = "Eye reference tracking"
  let positionHelp = "Keep both eyes visible. Move your head gently."
  if (mode === "ir")
    positionHelp = "Keep your face visible. Eye regions are automatic."
  if (replaying)
    positionHelp =
      "Inspect pupils and head pose. Use the video controls to play, pause, or seek."
  return (
    <main className="eye-app remote-app">
      <header className="eye-header">
        <Link to="/trials" className="eye-brand">
          <span className="eye-logo">
            <Eye size={21} />
          </span>
          GazeCore<span className="eye-version">V3</span>
        </Link>
        <div className="remote-header-tools">
          <Hint label="On-device processing">
            <ShieldCheck size={18} />
          </Hint>
          <SetupHelp preparation={selected?.preparation} />
        </div>
      </header>
      <div className="remote-content">
        <div className="remote-title">
          <div className="remote-page-heading">
            <Link
              className="remote-icon-button"
              to="/trials"
              aria-label="All trials"
            >
              <ArrowLeft size={18} />
              <span className="remote-tooltip" aria-hidden="true">
                All trials
              </span>
            </Link>
            <h1>Remote eye tracking</h1>
          </div>
          <ol className="remote-steps" aria-label="Setup progress">
            {(replaying ? STEPS.slice(0, 3) : STEPS).map((item, index) => (
              <li
                key={item.label}
                aria-current={step === index ? "step" : undefined}
                className={index <= step ? "active" : ""}
              >
                <Hint label={`${index + 1}. ${item.label}`}>
                  {index < step ? <Check size={17} /> : <item.icon size={18} />}
                </Hint>
              </li>
            ))}
          </ol>
        </div>
        {step === 0 && (
          <div className="remote-picker">
            <p>Choose a camera</p>
            <div className="remote-cards">
              {MODES.map((item) => (
                <button
                  type="button"
                  className="remote-mode-card"
                  key={item.id}
                  aria-label={item.title}
                  onClick={() => choose(item.id)}
                >
                  <item.icon size={34} strokeWidth={1.5} aria-hidden="true" />
                  <h2>{item.short}</h2>
                  <span className="remote-tooltip" aria-hidden="true">
                    {item.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {step > 0 && selected && (
          <div className="remote-setup-heading">
            <span>
              <selected.icon size={18} />
              {selected.short}
            </span>
            <div className="remote-actions">
              <LocalVideoButton onSelect={inspectVideo} />
              {replaying && (
                <IconButton label="Stop video" icon={Square} onClick={stop} />
              )}
              <IconButton
                label="Change setup"
                icon={SwitchCamera}
                onClick={() => {
                  stopTracker()
                  clearCalibration()
                  setStep(0)
                  setMode(null)
                }}
              />
            </div>
          </div>
        )}
        <div className="remote-workspace" hidden={step === 0}>
          <section className="remote-camera-panel" aria-label="Camera preview">
            <div className="remote-panel-title">
              <Hint
                label={
                  replaying
                    ? `Local video: ${tracker.sourceName}`
                    : "Camera preview"
                }
              >
                {replaying ? <FileVideo size={16} /> : <Camera size={16} />}
              </Hint>
              <span className="remote-camera-status">
                <span className={`status-light ${ready ? "on" : ""}`} />
                {ready ? `${tracker.fps.toFixed(0)} fps` : tracker.status}
              </span>
            </div>
            <div
              className={`remote-preview ${mode === "ir" || replaying ? "" : "mirrored"} ${selecting ? "selecting" : ""}`}
              style={{
                aspectRatio: observation
                  ? `${observation.width}/${observation.height}`
                  : "16/9",
              }}
              onPointerDown={(event) => {
                if (!selecting) return
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragStart(pointerPosition(event))
              }}
              onPointerUp={(event) => {
                if (!selecting || !dragStart) return
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
            >
              <video
                ref={videoRef}
                playsInline
                muted
                controls={replaying}
                aria-label={
                  replaying ? "Local video recording" : "Local camera feed"
                }
              />
              {observation && (
                <svg
                  className="remote-preview-overlay"
                  viewBox={`0 0 ${observation.width} ${observation.height}`}
                  aria-hidden="true"
                >
                  {observation.faceBox && (
                    <rect
                      {...observation.faceBox}
                      fill="none"
                      stroke="#a7d7c5"
                      strokeWidth="3"
                    />
                  )}
                  {observation.eyes.map((eye, index) => (
                    <circle
                      key={index}
                      cx={eye.center[0]}
                      cy={eye.center[1]}
                      r={Math.max(eye.radius, 3)}
                      fill="none"
                      stroke="#a7d7c5"
                      strokeWidth="3"
                    />
                  ))}
                  {mode === "ir" && (roi.width !== 1 || roi.height !== 1) && (
                    <rect
                      x={roi.x * observation.width}
                      y={roi.y * observation.height}
                      width={roi.width * observation.width}
                      height={roi.height * observation.height}
                      fill="none"
                      stroke="#edd7a4"
                      strokeWidth="3"
                    />
                  )}
                </svg>
              )}
              {mode === "ir" && observation?.eyeRegions && (
                <svg
                  className="remote-preview-overlay"
                  viewBox={`0 0 ${observation.width} ${observation.height}`}
                  aria-hidden="true"
                >
                  {observation.eyeRegions.map((region, index) => (
                    <rect
                      key={index}
                      {...region}
                      fill="none"
                      stroke="#edd7a4"
                      strokeWidth="2"
                    />
                  ))}
                  {observation.glints?.map((point, index) => (
                    <circle
                      key={index}
                      cx={point[0]}
                      cy={point[1]}
                      r={3}
                      fill="#edd7a4"
                    />
                  ))}
                </svg>
              )}
              {tracker.status !== "ready" && (
                <div
                  className="remote-preview-placeholder"
                  style={replaying ? { pointerEvents: "none" } : undefined}
                >
                  {tracker.status === "loading" ? (
                    <LoaderCircle size={30} className="remote-spin" />
                  ) : (
                    <Camera size={30} />
                  )}
                  <span>
                    {tracker.status === "loading" ? "Starting…" : "Camera off"}
                  </span>
                </div>
              )}
            </div>
            <div className="remote-preview-footer">
              <Hint label={valid ? "Eye signal available" : signalLabel}>
                <Eye
                  size={15}
                  className={valid ? "remote-good" : "remote-muted"}
                />
                <span>{valid ? "Ready" : "No signal"}</span>
              </Hint>
              <span>
                {observation
                  ? `${observation.width} × ${observation.height}`
                  : ""}
              </span>
            </div>
            <div className="remote-head-panel">
              <Hint label={headLabel}>
                <Move3D size={18} />
              </Hint>
              <HeadReadout
                pose={observation?.pose ?? null}
                reference={referenceTracking}
              />
            </div>
          </section>
          <section className="remote-controls">
            {tracker.error && (
              <div className="remote-alert error" role="alert">
                {tracker.error}
              </div>
            )}
            {notice && (
              <div className="remote-alert" role="status">
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
                <label className="remote-field">
                  <span className="remote-field-label">
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
                  <p className="remote-muted">
                    Allow camera access in your browser.
                  </p>
                )}
                {tracker.cameraError && (
                  <div className="remote-alert error" role="alert">
                    {tracker.cameraError}
                  </div>
                )}
                <div className="remote-actions">
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
                    <div className="remote-actions">
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
                      <p className="remote-muted">Drag around one eye.</p>
                    )}
                    <label className="remote-checkbox">
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
                      <label className="remote-field">
                        <span className="remote-field-label">
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
                <div className="remote-check">
                  <span className={`status-light ${valid ? "on" : ""}`} />
                  {valid ? "Eyes detected" : signalLabel}
                </div>
                <IconButton
                  label="Continue to calibration"
                  icon={ArrowRight}
                  primary
                  disabled={!valid || replaying}
                  onClick={() => {
                    if (!replaying) setStep(3)
                  }}
                />
                {replaying && (
                  <p className="remote-muted">
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
                <label className="remote-checkbox">
                  <input
                    type="checkbox"
                    aria-label="Include head movement"
                    checked={extended}
                    onChange={(event) => setExtended(event.target.checked)}
                  />
                  <Move3D size={18} />
                  <span>Head movement</span>
                </label>
                <div className="remote-actions">
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
                  <div className="remote-summary">
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
                <div className="remote-actions">
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
                <h2>Results</h2>
                {needsCalibration && (
                  <p className="remote-muted">Recalibration recommended.</p>
                )}
                <div className="remote-metrics">
                  <Hint label="Mean target error">
                    <strong>
                      {validation.meanPixels.toFixed(0)}
                      <small> px</small>
                    </strong>
                    <span>Mean</span>
                  </Hint>
                  <Hint label="95th percentile error">
                    <strong>
                      {validation.p95Pixels.toFixed(0)}
                      <small> px</small>
                    </strong>
                    <span>P95</span>
                  </Hint>
                  <Hint label="Within-target jitter">
                    <strong>
                      {validation.jitterPixels.toFixed(0)}
                      <small> px</small>
                    </strong>
                    <span>Jitter</span>
                  </Hint>
                </div>
                <p className="remote-muted">
                  {validation.targetCount} targets · {validation.sampleCount}{" "}
                  samples
                </p>
                {!supported && (
                  <div className="remote-alert" role="status">
                    Head moved beyond calibration. Recalibrate.
                  </div>
                )}
                <div className="remote-live-status">
                  <span className={`status-light ${point ? "on" : ""}`} />
                  {point
                    ? `${(point[0] * 100).toFixed(1)}%, ${(point[1] * 100).toFixed(1)}%`
                    : "Paused"}
                </div>
                <div className="remote-actions">
                  <IconButton
                    label={showGaze ? "Hide gaze dot" : "Show live gaze"}
                    icon={showGaze ? EyeOff : Eye}
                    primary
                    aria-pressed={showGaze}
                    onClick={() => setShowGaze((value) => !value)}
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
                  <details className="remote-details">
                    <summary aria-label="Calibrated head range">
                      <Move3D size={16} />
                      Head range
                    </summary>
                    {calibration.poseKind === "face" && (
                      <p>
                        Yaw {degrees(calibration.poseBounds.min[0]!)}–
                        {degrees(calibration.poseBounds.max[0]!)} · Pitch{" "}
                        {degrees(calibration.poseBounds.min[1]!)}–
                        {degrees(calibration.poseBounds.max[1]!)}
                      </p>
                    )}
                    <p>
                      X {(calibration.poseBounds.min[3]! * 100).toFixed(0)}–
                      {(calibration.poseBounds.max[3]! * 100).toFixed(0)}% · Y{" "}
                      {(calibration.poseBounds.min[4]! * 100).toFixed(0)}–
                      {(calibration.poseBounds.max[4]! * 100).toFixed(0)}%
                    </p>
                    <p>
                      Scale{" "}
                      {(Math.exp(calibration.poseBounds.min[5]!) * 100).toFixed(
                        1
                      )}
                      –
                      {(Math.exp(calibration.poseBounds.max[5]!) * 100).toFixed(
                        1
                      )}
                      %
                    </p>
                  </details>
                )}
              </>
            )}
            {step > 1 && (
              <div className="remote-bottom-actions">
                <IconButton
                  label="Previous step"
                  icon={ArrowLeft}
                  onClick={() => {
                    setCapture(null)
                    setShowGaze(false)
                    setStep(step - 1)
                  }}
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
      {showGaze &&
        !capture &&
        point &&
        point.every((value) => value >= 0 && value <= 1) && (
          <div
            className="remote-live-dot"
            style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }}
            aria-hidden="true"
          />
        )}
    </main>
  )
}
