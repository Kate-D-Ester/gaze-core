import { LiveControls } from "@/features/eye-tracking/steps/live-controls"
import { CalibrationControls } from "@/features/eye-tracking/steps/calibration-controls"
import { ModelControls } from "@/features/eye-tracking/steps/model-controls"
import { PupilControls } from "@/features/eye-tracking/steps/pupil-controls"
import { RegionControls } from "@/features/eye-tracking/steps/region-controls"
import { SourceControls } from "@/features/eye-tracking/steps/source-controls"
import { useCallback, useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Eye,
  LockKeyhole,
  Play,
  Square,
  X,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useTracker } from "@/features/eye-tracking/use-tracker"
import { EyePreview, PipelinePreviews } from "@/features/eye-tracking/preview"
import { CalibrationOverlay } from "@/features/eye-tracking/calibration-overlay"
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
} from "@/features/eye-tracking/types"
import "./v2.css"

const STEPS = [
  "Camera",
  "Eye region",
  "Pupil",
  "Eye model",
  "Calibrate",
  "Live gaze",
]
const COPY = [
  [
    "Give your eye a clear view.",
    "Use a near-eye camera, or open a recorded eye video.",
  ],
  [
    "Focus on one eye.",
    "Drag a box around the eye. Keep the pupil and its full movement inside.",
  ],
  [
    "Find a clean pupil outline.",
    "The green ellipse should follow the pupil as you look around.",
  ],
  [
    "Build your eye model.",
    "Slowly look left, right, up and down, then around the edges.",
  ],
  [
    "Make gaze meet the screen.",
    "Look at nine points to map the gaze ray to this browser window.",
  ],
  [
    "Your gaze, in real time.",
    "Check the dot, validate accuracy, or export the current result.",
  ],
]
export function V2Page() {
  const tracker = useTracker(),
    { settings, configure, source, frame } = tracker
  const [step, setStep] = useState(0),
    [deviceId, setDeviceId] = useState(""),
    [regionReady, setRegionReady] = useState(false),
    [pupilReady, setPupilReady] = useState(false)
  const [corner, setCorner] = useState<Point | null>(null),
    [calibration, setCalibration] = useState<Calibration | null>(null),
    [validation, setValidation] = useState<number | null>(null)
  const [capture, setCapture] = useState<"calibration" | "validation" | null>(
      null
    ),
    [focus, setFocus] = useState(false),
    [notice, setNotice] = useState("")
  const [eyeConfirmed, setEyeConfirmed] = useState(false)
  const clearCalibration = useCallback(() => {
    setCalibration(null)
    setValidation(null)
    setCapture(null)
    setFocus(false)
    setNotice("")
  }, [])
  const update = useCallback(
    (next: Partial<FrameSettings>) => {
      configure(next)
      clearCalibration()
      if ("roi" in next || "threshold" in next || "format" in next)
        setPupilReady(false)
    },
    [configure, clearCalibration]
  )
  const resetSource = () => {
    clearCalibration()
    setRegionReady(false)
    setPupilReady(false)
    setEyeConfirmed(false)
    setCorner(null)
  }
  const usable =
    !!frame?.detection.ellipse &&
    (settings.format === "classic" ||
      frame.detection.ellipse.confidence >= 0.85)
  const feature = frame?.gaze ? gazeFeature(frame.gaze.direction) : null
  const screenPoint =
    calibration && feature ? mapGaze(calibration, feature) : null
  const onscreen = screenPoint && screenPoint.every((v) => v >= 0 && v <= 1)
  const allowed = [
    true,
    !!source,
    regionReady && !!source,
    pupilReady && !!source,
    settings.locked && !!source,
    !!calibration && !!source,
  ]
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
        setStep(5)
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
      setStep(5)
      setNotice("Calibration saved for this session.")
    },
    [capture, calibration]
  )
  useEffect(() => {
    const resized = () => {
      setStep((current) => Math.min(current, 4))
      setCalibration(null)
      setValidation(null)
      setCapture(null)
      setFocus(false)
      setNotice("Window size changed. Calibrate again for this view.")
    }
    window.addEventListener("resize", resized)
    return () => window.removeEventListener("resize", resized)
  }, [])
  function chooseRegion(roi: Rect) {
    update({ roi, corners: null })
    setRegionReady(true)
    setEyeConfirmed(false)
    setCorner(null)
  }
  function chooseCorner(point: Point) {
    if (!corner) {
      setCorner(point)
      return
    }
    if (Math.hypot(point[0] - corner[0], point[1] - corner[1]) < 12) {
      setNotice("Place the corners farther apart.")
      return
    }
    update({ corners: [corner, point] })
    setCorner(null)
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
    <main className="eye-app">
      <header className="eye-header">
        <Link to="/dashboard" className="eye-brand">
          <span className="eye-logo">
            <Eye size={21} />
          </span>
          GazeCore<span className="eye-version">V2</span>
        </Link>
        <div className="eye-header-right">
          <span className="eye-local">
            <span className="status-light on" />
            On-device processing
          </span>
          <a
            href="https://www.youtube.com/watch?v=Gh8LS9erugE"
            target="_blank"
            rel="noreferrer"
            aria-label="Open the reference tutorial"
          >
            <CircleHelp size={19} />
          </a>
        </div>
      </header>
      <div className="eye-title-row">
        <div>
          <div className="eye-eyebrow">V2 PROGRESS</div>
          <h1>Eye tracking, step by step.</h1>
        </div>
        <div className="eye-formats" aria-label="Tracker format">
          {(["classic", "spatial"] as const).map((format, i) => (
            <button
              key={format}
              aria-pressed={settings.format === format}
              onClick={() => {
                if (format === settings.format) return
                update({
                  format,
                  threshold: format === "classic" ? 50 : 0,
                  corners: null,
                })
                setStep(0)
                setRegionReady(false)
                setEyeConfirmed(false)
                setCorner(null)
              }}
            >
              <span>Eye Tracker {i + 1}</span>
              <small>{i === 0 ? "Original method" : "3D · video method"}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="eye-workspace">
        <aside className="eye-sidebar">
          <div className="eye-section-label">
            YOUR PIPELINE <span>{Math.min(step + 1, 6)} / 6</span>
          </div>
          <nav aria-label="Setup steps">
            {STEPS.map((name, i) => (
              <button
                key={name}
                className={`eye-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
                aria-current={i === step ? "step" : undefined}
                disabled={!allowed[i]}
                onClick={() => go(i)}
              >
                <span className="eye-step-number">
                  {i < step ? (
                    <Check size={14} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span>{name}</span>
                {i === step && <span className="eye-step-dot" />}
              </button>
            ))}
          </nav>
          <div className="eye-sidebar-note">
            <Eye size={18} />
            <p>
              {settings.format === "spatial"
                ? "From a pupil outline to a 3D gaze ray."
                : "The original corner-based eye model."}
            </p>
            <a
              href="https://github.com/JEOresearch/EyeTracker/tree/main/3DTracker"
              target="_blank"
              rel="noreferrer"
            >
              {settings.format === "spatial"
                ? "Based on Jason Orlosky’s method ↗"
                : "View the reference research ↗"}
            </a>
          </div>
        </aside>
        <section className="eye-main-column">
          <div className="eye-stage-heading">
            <div>
              <span className="eye-eyebrow">
                STEP {String(step + 1).padStart(2, "0")} /{" "}
                {STEPS[step].toUpperCase()}
              </span>
              <h2>{COPY[step][0]}</h2>
              <p>{COPY[step][1]}</p>
            </div>
            {source && (
              <button
                className="eye-icon-button"
                onClick={() => {
                  tracker.stop()
                  resetSource()
                  setStep(0)
                }}
                aria-label="Stop camera"
              >
                <Square size={16} />
              </button>
            )}
          </div>
          {source?.kind === "sample" && (
            <div className="eye-sample-banner">
              <Play size={13} />
              Synthetic sample · demonstration only
              <span>Camera accuracy is not measured here.</span>
            </div>
          )}
          <EyePreview
            tracker={tracker}
            selectRegion={step === 1}
            selectCorners={
              step === 3 && settings.format === "classic" && !settings.locked
            }
            onRegion={chooseRegion}
            onCorner={chooseCorner}
          />
          <div className="eye-preview-caption">
            <span>
              <i className="legend-dot pupil" />
              Pupil
            </span>
            <span>
              <i className="legend-dot sphere" />
              Eye sphere
            </span>
            <span>
              <i className="legend-dot ray" />
              Gaze ray
            </span>
            <span className="eye-caption-right">
              {source?.name ?? "No camera connected"}
            </span>
          </div>
          <div className="eye-section-label eye-preview-label">
            {settings.format === "spatial"
              ? "THRESHOLD COMPARISON"
              : "PUPIL SEGMENTATION"}
            <span>
              {frame?.detection.ellipse
                ? `${Math.round(frame.detection.ellipse.confidence * 100)}% contour fit`
                : "Waiting for pupil"}
            </span>
          </div>
          <PipelinePreviews frame={frame} />
          {(tracker.error || notice) && (
            <p
              className={`eye-message ${tracker.error ? "error" : ""}`}
              role={tracker.error ? "alert" : "status"}
            >
              {tracker.error || notice}
            </p>
          )}
        </section>
        <aside className="eye-controls">
          <div className="eye-section-label">
            {
              [
                "INPUT SOURCE",
                "REGION SETUP",
                "PUPIL CHECK",
                "MODEL SETUP",
                "SCREEN MAPPING",
                "LIVE OUTPUT",
              ][step]
            }
            <span>
              {tracker.engineReady ? "Engine ready" : "Loading engine…"}
            </span>
          </div>
          {step === 0 && (
            <SourceControls
              tracker={tracker}
              deviceId={deviceId}
              setDeviceId={setDeviceId}
              resetSource={resetSource}
            />
          )}
          {step === 1 && (
            <RegionControls
              tracker={tracker}
              eyeConfirmed={eyeConfirmed}
              onConfirm={(value) => {
                setEyeConfirmed(value)
                if (value) setRegionReady(true)
              }}
              chooseRegion={chooseRegion}
            />
          )}
          {step === 2 && (
            <PupilControls tracker={tracker} update={update} usable={usable} />
          )}
          {step === 3 && (
            <ModelControls
              tracker={tracker}
              corner={corner}
              update={update}
              setNotice={setNotice}
            />
          )}
          {step === 4 && (
            <CalibrationControls
              usable={usable}
              locked={settings.locked}
              onStart={() => {
                setNotice("")
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
              onFocus={() => setFocus(true)}
              onValidate={() => setCapture("validation")}
              onRecalibrate={() => {
                clearCalibration()
                setStep(4)
              }}
              onExport={exportResult}
            />
          )}
          <div className="eye-controls-footer">
            <span>
              <LockKeyhole size={13} />
              Frames stay on your device
            </span>
          </div>
        </aside>
      </div>
      <footer className="eye-bottom-bar">
        <span>
          {settings.format === "spatial" ? "Eye Tracker 2" : "Eye Tracker 1"}{" "}
          <i /> {STEPS[step]}
        </span>
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
          {step < 4 && (
            <button
              className="eye-button primary"
              disabled={
                step === 0
                  ? !source
                  : step === 1
                    ? !(regionReady && eyeConfirmed)
                    : step === 2
                      ? !usable
                      : !(frame?.model?.ready && usable)
              }
              onClick={() => {
                if (step === 2) setPupilReady(true)
                if (step === 3) configure({ locked: true }, false)
                setStep((s) => s + 1)
              }}
            >
              {step === 3 ? "Lock model" : "Continue"}
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
            <h2>
              {!screenPoint
                ? "Pupil lost"
                : onscreen
                  ? "Look around."
                  : "Gaze outside this view"}
            </h2>
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
