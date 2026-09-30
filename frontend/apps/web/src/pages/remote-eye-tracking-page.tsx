import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  Eye,
  ScanEye,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
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
    icon: Smartphone,
    label: "Selfie camera",
    description:
      "Track on your phone with its front camera. Calibrate for the way you hold the device and move your head.",
    technique: "Appearance gaze + phone pose interactions",
    preparation:
      "Rest your phone on a support. Face the selfie camera, with both eyes visible and even front lighting.",
  },
  {
    id: "webcam" as const,
    title: "Webcam-based eye tracker",
    icon: Camera,
    label: "Laptop or USB camera",
    description:
      "Use your computer camera to estimate screen gaze, with continuous head position and rotation tracking.",
    technique: "Appearance gaze + face and eye geometry",
    preparation:
      "Place the camera above your screen. Keep both eyes visible, avoid glare on glasses, and use even front lighting.",
  },
  {
    id: "ir" as const,
    title: "IR webcam-based eye tracker",
    icon: ScanEye,
    label: "IR camera + corneal reflection",
    description:
      "Use a compatible IR eye image to track the pupil relative to a corneal reflection and compensate for reference motion.",
    technique: "Pupil–corneal reflection + reference compensation",
    preparation:
      "Select an IR camera that shows a dark pupil and one clear corneal reflection. Frame one eye, then select its region below.",
  },
]
const STEPS = [
  "Choose",
  "Camera",
  "Position",
  "Calibrate",
  "Validate",
  "Results",
]
const FULL_ROI: Rect = { x: 0, y: 0, width: 1, height: 1 }
function degrees(value: number | null) {
  return value === null ? "—" : `${Math.round((value * 180) / Math.PI)}°`
}
function HeadReadout({ pose }: { pose: HeadPose | null }) {
  if (!pose)
    return (
      <p className="remote-muted">
        Waiting for a clear {"head or eye reference"}…
      </p>
    )
  const isFace = pose.kind === "face"
  return (
    <div className="remote-head-readout">
      <div>
        <span>{isFace ? "Yaw" : "Reference X"}</span>
        <strong>
          {isFace ? degrees(pose.yaw) : `${Math.round(pose.x * 100)}%`}
        </strong>
      </div>
      <div>
        <span>{isFace ? "Pitch" : "Reference Y"}</span>
        <strong>
          {isFace ? degrees(pose.pitch) : `${Math.round(pose.y * 100)}%`}
        </strong>
      </div>
      <div>
        <span>{isFace ? "Roll" : "Eye scale"}</span>
        <strong>
          {isFace ? degrees(pose.roll) : `${(pose.scale * 100).toFixed(1)}%`}
        </strong>
      </div>
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
    stop: stopTracker,
  } = useRemoteTracker(settings, () => {
    clearCalibration()
    setStep(1)
  })
  const selected = MODES.find((item) => item.id === mode)
  const ready = tracker.status === "ready"
  const observation = tracker.observation
  const valid =
    ready &&
    !!observation?.feature &&
    !observation.reason &&
    observation.quality >= 0.45
  const activeCalibration = ready ? calibration : null
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
      setStep(ready ? 3 : 1)
      setNotice(
        "The screen or camera context changed. Calibrate again before using screen gaze."
      )
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
  }, [ready, mode])
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
    if (capture === "calibrate" && mode) {
      const fitted = fitRemoteCalibration(mode, collected)
      if (!fitted) {
        setNotice(
          "Calibration could not separate gaze reliably. Check framing and lighting, then repeat the targets with small head movements."
        )
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
          "Validation needs clear samples at all five targets. Return to the calibrated head range and retry."
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
        mode === "ir"
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
  let assessment = "Measured on this setup"
  if (validation && diagonal)
    assessment =
      validation.meanPixels > diagonal * 0.08
        ? "Recalibration recommended"
        : "Use the measured error to size your gaze targets"
  let startLabel = ready ? "Restart camera" : "Start camera"
  if (tracker.status === "loading") startLabel = "Starting…"
  return (
    <main className="eye-app remote-app">
      <header className="eye-header">
        <Link to="/trials" className="eye-brand">
          <span className="eye-logo">
            <Eye size={21} />
          </span>
          GazeCore<span className="eye-version">V3</span>
        </Link>
        <span className="eye-local">
          <ShieldCheck size={15} />
          On-device processing
        </span>
      </header>
      <div className="remote-content">
        <Link className="remote-back" to="/trials">
          <ArrowLeft size={15} /> All trials
        </Link>
        <div className="remote-title">
          <div>
            <p className="remote-eyebrow">REMOTE TRACKING</p>
            <h1>Remote eye tracking</h1>
            <p>
              Choose your camera. Calibrate your eyes and head. Measure your
              screen gaze.
            </p>
          </div>
          <span className="remote-trial-tag">Research trial</span>
        </div>
        <ol className="remote-steps" aria-label="Setup progress">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={index <= step ? "active" : ""}
            >
              <span>{index < step ? <Check size={12} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <>
            <div className="remote-intro">
              <h2>Find your setup</h2>
              <p>
                Each camera uses a tailored tracking method and its own
                calibration.
              </p>
            </div>
            <div className="remote-cards">
              {MODES.map((item) => (
                <button
                  className="remote-mode-card"
                  key={item.id}
                  onClick={() => choose(item.id)}
                >
                  <span className="remote-mode-icon">
                    <item.icon size={26} />
                  </span>
                  <span className="remote-mode-label">{item.label}</span>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                  <span className="remote-mode-technique">
                    {item.technique}
                  </span>
                  <span className="remote-card-action">
                    Set up tracker <ArrowRight size={17} />
                  </span>
                </button>
              ))}
            </div>
            <div className="remote-note">
              <ShieldCheck size={18} />
              <p>
                Camera frames stay on this device. Accuracy depends on the
                camera, lighting, and calibration; the validation step measures
                your setup.
              </p>
            </div>
          </>
        )}
        {step > 0 && selected && (
          <div className="remote-setup-heading">
            <div>
              <span className="remote-mode-label">{selected.label}</span>
              <h2>{selected.title}</h2>
            </div>
            <button
              className="remote-button secondary"
              onClick={() => {
                stopTracker()
                clearCalibration()
                setStep(0)
                setMode(null)
              }}
            >
              Change setup
            </button>
          </div>
        )}
        <div className="remote-workspace" hidden={step === 0}>
          <section className="remote-camera-panel" aria-label="Camera preview">
            <div className="remote-panel-title">
              <span>Camera preview</span>
              <span className="remote-camera-status">
                <span className={`status-light ${ready ? "on" : ""}`} />
                {ready ? `${tracker.fps.toFixed(0)} fps` : tracker.status}
              </span>
            </div>
            <div
              className={`remote-preview ${mode === "ir" ? "" : "mirrored"} ${selecting ? "selecting" : ""}`}
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
                aria-label="Local camera feed"
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
                  {mode === "ir" && (
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
              {tracker.status !== "ready" && (
                <div className="remote-preview-placeholder">
                  <Camera size={32} />
                  <span>
                    {tracker.status === "loading"
                      ? "Starting camera and loading local models…"
                      : "Your camera preview will appear here"}
                  </span>
                </div>
              )}
            </div>
            <div className="remote-preview-footer">
              <span className={valid ? "remote-good" : "remote-muted"}>
                {valid
                  ? "Eye signal available"
                  : (observationStatus(observation?.reason) ??
                    "Waiting for camera")}
              </span>
              <span>
                {observation
                  ? `${observation.width} × ${observation.height}`
                  : ""}
              </span>
            </div>
            <div className="remote-head-panel">
              <h3>
                {mode === "ir"
                  ? "Eye reference tracking"
                  : "Live head tracking"}
              </h3>
              <HeadReadout pose={observation?.pose ?? null} />
              <p className="remote-muted">
                {mode === "ir"
                  ? "Translation and apparent scale come from the corneal reflection. Full head rotation requires a face view or additional calibrated hardware."
                  : "Rotation, image position, and apparent face size are recorded with every eye sample."}
              </p>
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
                <p className="remote-eyebrow">CAMERA ACCESS</p>
                <h2>Connect your camera</h2>
                <p>{selected?.preparation}</p>
                <p className="remote-muted">
                  Allow camera access when prompted. On a phone, open this page
                  over HTTPS to use the selfie camera.
                </p>
                {tracker.devices.length > 0 && (
                  <label className="remote-field">
                    Camera
                    <select
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
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="remote-actions">
                  <button
                    className="remote-button"
                    disabled={tracker.status === "loading"}
                    onClick={start}
                  >
                    {startLabel}
                  </button>
                  {(ready || tracker.status === "loading") && (
                    <button className="remote-button secondary" onClick={stop}>
                      Stop camera
                    </button>
                  )}
                </div>
                <button
                  className="remote-button full"
                  disabled={!ready}
                  onClick={() => setStep(2)}
                >
                  Check your position <ArrowRight size={16} />
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <p className="remote-eyebrow">POSITION CHECK</p>
                <h2>
                  {mode === "ir"
                    ? "Frame one eye clearly"
                    : "Let the camera see both eyes"}
                </h2>
                <p>{selected?.preparation}</p>
                <p>
                  Move your head slightly and check that the live readout
                  updates. During calibration, keep looking at each dot while
                  changing your head position gently.
                </p>
                {mode === "ir" && (
                  <div className="remote-ir-controls">
                    <button
                      className="remote-button secondary"
                      onClick={() => setSelecting((value) => !value)}
                    >
                      {selecting
                        ? "Drag around one eye in the preview"
                        : "Choose eye region"}
                    </button>
                    <button
                      className="remote-button secondary"
                      onClick={() => {
                        setRoi(FULL_ROI)
                        clearCalibration()
                      }}
                    >
                      Reset region
                    </button>
                    <label className="remote-field">
                      Pupil threshold · {threshold === 0 ? "Auto" : threshold}
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={threshold}
                        onChange={(event) => {
                          setThreshold(Number(event.target.value))
                          clearCalibration()
                        }}
                      />
                    </label>
                    <p className="remote-muted">
                      A regular camera with an IR filter alone may not show the
                      reflection this method needs.
                    </p>
                  </div>
                )}
                <div className="remote-check">
                  <span className={`status-light ${valid ? "on" : ""}`} />
                  {valid
                    ? "Eyes and motion reference detected"
                    : "Waiting for a clear eye signal"}
                </div>
                <button
                  className="remote-button full"
                  disabled={!valid}
                  onClick={() => setStep(3)}
                >
                  Continue to calibration <ArrowRight size={16} />
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <p className="remote-eyebrow">PERSONAL CALIBRATION</p>
                <h2>Teach the tracker your screen</h2>
                <p>
                  Look at nine targets. Each target records multiple eye samples
                  and their matching head positions, even when your head moves.
                </p>
                <label className="remote-checkbox">
                  <input
                    type="checkbox"
                    checked={extended}
                    onChange={(event) => setExtended(event.target.checked)}
                  />
                  <span>
                    <strong>Include another head position</strong>
                    <small>
                      Repeat the targets with gentle head turns or shifts.
                      Recommended for remote tracking.
                    </small>
                  </span>
                </label>
                <p className="remote-muted">
                  Keep the camera and screen in place. Turn your head a little
                  while your eyes stay on the dot; comfortable movements are
                  enough.
                </p>
                <button
                  className="remote-button full"
                  disabled={!valid}
                  onClick={() => {
                    setCapture("calibrate")
                    setShowGaze(false)
                  }}
                >
                  Start {extended ? "18" : "9"}-target calibration{" "}
                  <ArrowRight size={16} />
                </button>
              </>
            )}
            {step === 4 && (
              <>
                <p className="remote-eyebrow">INDEPENDENT VALIDATION</p>
                <h2>Measure this setup</h2>
                <p>
                  Follow five new targets. We compare the predicted gaze with
                  the target positions to measure error in screen pixels.
                </p>
                {calibration && (
                  <div className="remote-summary">
                    <span>{calibration.sampleCount} synchronized samples</span>
                    <span>{calibration.targetCount} screen locations</span>
                    <span>Head positions retained per frame</span>
                  </div>
                )}
                <button
                  className="remote-button full"
                  disabled={!valid || !activeCalibration}
                  onClick={() => setCapture("validate")}
                >
                  Validate gaze <ArrowRight size={16} />
                </button>
                <button
                  className="remote-button secondary full"
                  onClick={() => {
                    clearCalibration()
                    setStep(3)
                  }}
                >
                  Repeat calibration
                </button>
              </>
            )}
            {step === 5 && validation && (
              <>
                <p className="remote-eyebrow">YOUR RESULTS</p>
                <h2>{assessment}</h2>
                <div className="remote-metrics">
                  <div>
                    <strong>
                      {validation.meanPixels.toFixed(0)}
                      <small> px</small>
                    </strong>
                    <span>Mean target error</span>
                  </div>
                  <div>
                    <strong>
                      {validation.p95Pixels.toFixed(0)}
                      <small> px</small>
                    </strong>
                    <span>95th percentile error</span>
                  </div>
                  <div>
                    <strong>
                      {validation.jitterPixels.toFixed(0)}
                      <small> px</small>
                    </strong>
                    <span>Within-target jitter</span>
                  </div>
                </div>
                <p className="remote-muted">
                  {validation.targetCount} unseen targets ·{" "}
                  {validation.sampleCount} samples · {viewport.width} ×{" "}
                  {viewport.height} screen. These measurements apply to this
                  session and camera position.
                </p>
                {!supported && (
                  <div className="remote-alert" role="status">
                    Your head is outside the calibrated range. Gaze output is
                    paused. Add the new head position with labeled targets.
                  </div>
                )}
                <div className="remote-live-status">
                  <span className={`status-light ${point ? "on" : ""}`} />
                  {point
                    ? `Screen gaze ${(point[0] * 100).toFixed(1)}%, ${(point[1] * 100).toFixed(1)}%`
                    : "Gaze paused — return to a clear, calibrated position"}
                </div>
                <div className="remote-actions">
                  <button
                    className="remote-button"
                    onClick={() => setShowGaze((value) => !value)}
                  >
                    {showGaze ? "Hide gaze dot" : "Show live gaze"}
                  </button>
                  <button
                    className="remote-button secondary"
                    onClick={exportResults}
                  >
                    <Download size={15} />
                    Export results
                  </button>
                </div>
                <button
                  className="remote-button secondary full"
                  onClick={() => {
                    setExtended(true)
                    clearCalibration()
                    setStep(3)
                  }}
                >
                  Recalibrate with head movement
                </button>
                {calibration && (
                  <details className="remote-details">
                    <summary>Calibrated head range</summary>
                    {calibration.poseKind === "face" && (
                      <p>
                        Yaw {degrees(calibration.poseBounds.min[0]!)} to{" "}
                        {degrees(calibration.poseBounds.max[0]!)} · Pitch{" "}
                        {degrees(calibration.poseBounds.min[1]!)} to{" "}
                        {degrees(calibration.poseBounds.max[1]!)}
                      </p>
                    )}
                    <p>
                      Image X{" "}
                      {(calibration.poseBounds.min[3]! * 100).toFixed(0)}–
                      {(calibration.poseBounds.max[3]! * 100).toFixed(0)}% · Y{" "}
                      {(calibration.poseBounds.min[4]! * 100).toFixed(0)}–
                      {(calibration.poseBounds.max[4]! * 100).toFixed(0)}%
                    </p>
                    <p>
                      Apparent scale{" "}
                      {(Math.exp(calibration.poseBounds.min[5]!) * 100).toFixed(
                        1
                      )}
                      –
                      {(Math.exp(calibration.poseBounds.max[5]!) * 100).toFixed(
                        1
                      )}
                      %. Moving the camera or changing screen orientation
                      requires a new calibration.
                    </p>
                  </details>
                )}
              </>
            )}
            {step > 1 && (
              <div className="remote-bottom-actions">
                <button
                  className="remote-text-button"
                  onClick={() => {
                    setCapture(null)
                    setShowGaze(false)
                    setStep(step - 1)
                  }}
                >
                  <ArrowLeft size={14} />
                  Previous step
                </button>
                <button className="remote-text-button" onClick={stop}>
                  Stop camera
                </button>
              </div>
            )}
          </section>
        </div>
        <details className="remote-research">
          <summary>How the three methods work</summary>
          <p>
            Mobile and webcam modes use a pretrained appearance gaze model, with
            synchronized face pose and iris geometry. Their calibration features
            adapt to phone position or desktop head movement. IR mode uses
            pupil–corneal reflection displacement and current reference
            position/scale. A single eye view cannot supply full head rotation.
          </p>
          <p>
            The output is calibrated 2D screen gaze. Physical 3D gaze vectors
            and angular accuracy require camera, screen, and optical geometry
            measurements. Browser camera performance must be validated on the
            actual hardware.
          </p>
          <p>
            Research:{" "}
            <a
              href="https://arxiv.org/html/2508.19544v1"
              target="_blank"
              rel="noreferrer"
            >
              WebEyeTrack
            </a>{" "}
            ·{" "}
            <a
              href="https://arxiv.org/html/2508.10268v1"
              target="_blank"
              rel="noreferrer"
            >
              MobilePoG head movement calibration
            </a>{" "}
            ·{" "}
            <a
              href="https://www.nature.com/articles/s41467-020-18360-5"
              target="_blank"
              rel="noreferrer"
            >
              Smartphone gaze research
            </a>
            . RGB weights are included for this research trial; commercial model
            rights need separate verification.
          </p>
        </details>
      </div>
      {capture && ready && (
        <RemoteCalibrationOverlay
          latest={latest}
          extended={extended}
          calibration={capture === "validate" ? activeCalibration : null}
          onComplete={finishCapture}
          onCancel={() => {
            setCapture(null)
            setNotice(
              "Capture canceled. Keep the screen orientation fixed and try again."
            )
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
