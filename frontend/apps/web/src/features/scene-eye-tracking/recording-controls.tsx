import {
  ChartNoAxesCombined,
  Download,
  FileJson,
  FileSpreadsheet,
  LoaderCircle,
  Square,
  Trash2,
  Video,
} from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { setCanvasDimensions } from "../eye-tracking/canvas-sizing"
import { drawEyePreviewFrame } from "../eye-tracking/components/eye-preview"
import { drawGazeBubbleOverlay } from "../gaze-bubble/gaze-bubble-overlay"
import { HelpTip } from "../eye-tracking/components/help-tip"
import { CameraSpinnerStyles } from "../tracking-ui/camera-styles"
import {
  EyeButtonStyles,
  EyeGuidanceRowStyles,
  EyeTextButtonStyles,
} from "../tracking-ui/control-styles"
import {
  SceneCheckboxStyles,
  SceneDownloadsStyles,
  SceneHeatmapStyles,
  SceneRecordingStyles,
} from "../tracking-ui/scene-styles"
import { download } from "./download"
import { heatmapCanvas } from "./heatmap"
import { MAX_FRAME_AGE_MS } from "./calibration"
import type {
  RecordingControlsProps,
  RecordingOverlayFrame,
} from "./recording-controls.types"
import { hasCurrentAccuracyCheck } from "./scene-session"
import { exportSessionCsv, exportSessionJson } from "./session"
import { SessionRecorder } from "./session-recorder"

function drawRecordingValues(canvas: HTMLCanvasElement, lines: string[]) {
  const context = canvas.getContext("2d")
  if (!context) {
    return
  }
  const fontSize = Math.max(12, Math.round(canvas.width / 50))
  const padding = fontSize * 0.6
  const lineHeight = fontSize * 1.5
  const top = canvas.height - lines.length * lineHeight - padding * 2
  context.save()
  context.fillStyle = "rgba(0,0,0,0.8)"
  context.fillRect(0, top, canvas.width, canvas.height - top)
  context.font = `${fontSize}px monospace`
  context.textBaseline = "top"
  context.fillStyle = "#f4f4f2"
  lines.forEach((line, index) => {
    context.fillText(
      line,
      padding,
      top + padding + index * lineHeight,
      canvas.width - padding * 2
    )
  })
  context.restore()
}

export function drawRecordingOverlays(
  sceneCanvas: HTMLCanvasElement,
  eyeCanvas: HTMLCanvasElement | null,
  { camera, tracker, state, preview }: RecordingOverlayFrame,
  now: number
) {
  const scene = camera.latest
  const measurement = state.measurement
  const maxAge = MAX_FRAME_AGE_MS + Math.abs(state.delayMs)
  const sceneFresh =
    !!scene &&
    now >= scene.timestamp &&
    now - scene.timestamp <= MAX_FRAME_AGE_MS
  const gazeFresh =
    sceneFresh &&
    !!measurement &&
    measurement.eyeTimestamp !== null &&
    measurement.sceneTimestamp !== null &&
    now >= measurement.eyeTimestamp &&
    now - measurement.eyeTimestamp <= maxAge &&
    now >= measurement.sceneTimestamp &&
    now - measurement.sceneTimestamp <= maxAge
  let gazeValues = "Gaze unavailable"
  let gazeStatus = measurement?.reason || "Waiting for gaze"
  if (
    gazeFresh &&
    measurement.position &&
    (measurement.valid || measurement.preview)
  ) {
    const [x, y] = measurement.position
    gazeValues = `Gaze X ${(x * scene.width).toFixed(1)} px  Y ${(y * scene.height).toFixed(1)} px | ${x.toFixed(3)}, ${y.toFixed(3)}`
    gazeStatus = "Accuracy checked"
    if (measurement.preview) {
      gazeStatus = "Unverified preview"
    } else if (measurement.estimated) {
      gazeStatus = "Estimate - accuracy not checked"
    }
    gazeStatus += ` | Confidence ${Math.round(measurement.confidence * 100)}%`
  } else if (!sceneFresh) {
    gazeStatus = "Scene frames unavailable"
  } else if (!gazeFresh) {
    gazeStatus = "Eye frames unavailable"
  }
  const source = preview.scene.current
  setCanvasDimensions(
    sceneCanvas,
    camera.rawCanvas.width,
    camera.rawCanvas.height
  )
  const context = sceneCanvas.getContext("2d")
  if (context) {
    context.fillStyle = "#111111"
    context.fillRect(0, 0, sceneCanvas.width, sceneCanvas.height)
    if (sceneFresh && source) {
      context.drawImage(source, 0, 0, sceneCanvas.width, sceneCanvas.height)
    }
    if (
      gazeFresh &&
      (measurement?.valid || measurement?.preview) &&
      preview.gaze.current
    ) {
      drawGazeBubbleOverlay(
        context,
        preview.gaze.current,
        sceneCanvas.width,
        sceneCanvas.height
      )
    }
    drawRecordingValues(sceneCanvas, [gazeValues, gazeStatus])
  }
  if (!eyeCanvas) {
    return
  }
  const eyeSource = tracker.sourceCanvas.current
  const eyeFrame = tracker.frame
  const eyeFresh =
    !!eyeFrame &&
    now >= eyeFrame.timestamp &&
    now - eyeFrame.timestamp <= MAX_FRAME_AGE_MS
  let pupilValues = "Pupil unavailable"
  let vectorValues = "Eye gaze vector unavailable"
  if (eyeSource) {
    drawEyePreviewFrame(eyeCanvas, eyeSource, {
      frame: eyeFresh ? eyeFrame : null,
      roi: tracker.settings.roi,
      corners: tracker.settings.corners,
    })
  } else {
    const eyeContext = eyeCanvas.getContext("2d")
    if (eyeContext) {
      eyeContext.fillStyle = "#111111"
      eyeContext.fillRect(0, 0, eyeCanvas.width, eyeCanvas.height)
    }
  }
  if (eyeFresh && eyeFrame.detection.ellipse) {
    const pupil = eyeFrame.detection.ellipse
    const x = pupil.center[0] + eyeFrame.roi.x
    const y = pupil.center[1] + eyeFrame.roi.y
    pupilValues = `Pupil X ${x.toFixed(1)} px  Y ${y.toFixed(1)} px | ${Math.round(pupil.confidence * 100)}%`
    if (eyeFrame.gaze) {
      vectorValues = `Eye vector ${eyeFrame.gaze.direction.map((value) => value.toFixed(3)).join(", ")}`
    }
  }
  drawRecordingValues(eyeCanvas, [
    pupilValues,
    vectorValues,
    gazeValues,
    gazeStatus,
  ])
}

export function RecordingControls({
  camera,
  tracker,
  state,
  hand,
  identity,
  onRecordingChange,
  preview,
}: RecordingControlsProps) {
  const [recorder] = useState(() => new SessionRecorder())
  const [withEye, setWithEye] = useState(true)
  const sceneCanvas = useRef<HTMLCanvasElement | null>(null)
  const eyeCanvas = useRef<HTMLCanvasElement | null>(null)
  const liveFrame = useRef<RecordingOverlayFrame>({
    camera,
    tracker,
    state,
    preview,
  })
  useLayoutEffect(() => {
    liveFrame.current = { camera, tracker, state, preview }
  }, [camera, tracker, state, preview])
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null)
  const [exportError, setExportError] = useState("")
  const recording = useSyncExternalStore(
    recorder.subscribe,
    recorder.getSnapshot
  )
  let recordDisabledReason = ""
  if (recording.finalizing) {
    recordDisabledReason = "Wait for the previous recording to finish saving."
  } else if (!state.calibration) {
    recordDisabledReason = "Complete a calibration before recording."
  } else if (state.capture) {
    recordDisabledReason = "Finish or cancel point collection before recording."
  } else if (!camera.latest) {
    recordDisabledReason = "Connect the scene camera before recording."
  }
  useEffect(() => {
    onRecordingChange?.(recording.recording || recording.finalizing)
  }, [onRecordingChange, recording.recording, recording.finalizing])
  useEffect(() => {
    void recorder.stop(
      "Camera or eye setup changed. Save the completed session before recording again."
    )
  }, [identity, recorder])
  useEffect(() => {
    void recorder.stop("Calibration changed. The recording was finalized.")
  }, [state.calibration, recorder])
  useEffect(() => {
    if (state.capture) {
      void recorder.stop(
        "Point collection started. The recording was finalized."
      )
    }
  }, [state.capture, recorder])
  useEffect(() => {
    void recorder.stop("Gaze offset changed. The recording was finalized.")
  }, [state.offset, recorder])
  useEffect(() => {
    recorder.observeMeasurement(state.measurement)
  }, [recorder, state.measurement])
  useEffect(() => {
    recorder.observeHand(hand)
  }, [recorder, hand])
  useEffect(() => () => recorder.dispose(), [recorder])
  useEffect(() => {
    if (!recording.recording) {
      return
    }
    let animation = 0
    let lastPaint = -Infinity
    function paint(now: number) {
      if (sceneCanvas.current && now - lastPaint >= 1000 / 30) {
        try {
          drawRecordingOverlays(
            sceneCanvas.current,
            withEye ? eyeCanvas.current : null,
            liveFrame.current,
            now
          )
          lastPaint = now
        } catch {
          void recorder.stop(
            "The video overlay could not be drawn. Available recording data was saved."
          )
          return
        }
      }
      animation = requestAnimationFrame(paint)
    }
    animation = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(animation)
  }, [recording.recording, recorder, withEye])
  useEffect(
    () => () => {
      if (heatmapUrl) {
        URL.revokeObjectURL(heatmapUrl)
      }
    },
    [heatmapUrl]
  )
  function start() {
    if (recordDisabledReason || !sceneCanvas.current) {
      return
    }
    setHeatmapUrl(null)
    setExportError("")
    try {
      drawRecordingOverlays(
        sceneCanvas.current,
        withEye ? eyeCanvas.current : null,
        liveFrame.current,
        performance.now()
      )
    } catch {
      setExportError(
        "The video overlay could not be drawn. Reconnect the cameras and try again."
      )
      return
    }
    let accuracy = "unverified"
    if (hasCurrentAccuracyCheck(state)) {
      accuracy = "independently-checked"
    } else if (state.reusedCalibration) {
      accuracy = "reused-calibration-not-rechecked"
    } else if (state.method === "one-point") {
      accuracy = "one-point-estimate"
    }
    recorder.start(
      sceneCanvas.current,
      eyeCanvas.current,
      {
        scene: camera.getSnapshot().source,
        sceneTransform: camera.getSnapshot().transform,
        sceneWidth: camera.latest?.width,
        sceneHeight: camera.latest?.height,
        eye: tracker.source,
        eyeTransform: tracker.transform,
        eyeWidth: tracker.frame?.width,
        eyeHeight: tracker.frame?.height,
        settings: tracker.settings,
        eyeModel: tracker.frame?.model,
        calibration: state.calibration,
        calibrationMethod: state.method,
        accuracy,
        videoContent:
          "Rendered scene gaze and pupil overlays with gaze coordinates",
        validation: state.validation,
        gazeOffset: { normalized: state.offset },
        delayMs: state.delayMs,
        synchronization:
          "Browser decode/receipt timestamps; not hardware synchronized",
        heatmap: "Camera-image dwell density; not registered to world objects",
        mediapipe: "0.10.32; hand_landmarker float16 v1",
      },
      null,
      withEye,
      camera.rawCanvas
    )
  }
  async function heatmap() {
    try {
      const log = recording.log
      const background = recording.background
      if (!log || !background) {
        return
      }
      const canvas = heatmapCanvas(log.measurements, background)
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("PNG export failed.")),
          "image/png"
        )
      )
      setHeatmapUrl(URL.createObjectURL(blob))
      download(blob, "scene-gaze-heatmap.png")
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Unable to export the heatmap."
      )
    }
  }
  let recordLabel = recording.log ? "New recording" : "Record"
  if (recording.finalizing) {
    recordLabel = "Saving…"
  }
  const recordingActionIcon = recording.finalizing ? (
    <LoaderCircle
      className={`camera-spinner ${CameraSpinnerStyles}`}
      size={16}
      aria-hidden="true"
    />
  ) : (
    <Video size={16} aria-hidden="true" />
  )
  return (
    <div className={`scene-recording ${SceneRecordingStyles}`}>
      <canvas ref={sceneCanvas} hidden aria-hidden="true" />
      <canvas ref={eyeCanvas} hidden aria-hidden="true" />
      <div className={`eye-guidance-row ${EyeGuidanceRowStyles}`}>
        <h3>Recording</h3>
        <HelpTip
          label="Recording help"
          text="Videos include gaze, pupil and landmark overlays with coordinates. Everything stays on this device. Unverified gaze is labeled. Sessions stop at 10 minutes or 128 MiB. A new recording replaces previous downloads."
        />
      </div>
      {!recording.recording && (
        <label className={`scene-checkbox ${SceneCheckboxStyles}`}>
          <input
            type="checkbox"
            checked={withEye}
            onChange={(e) => setWithEye(e.target.checked)}
            disabled={recording.finalizing}
          />
          Include eye tracking video
        </label>
      )}
      {recording.recording ? (
        <>
          <p role="status">
            {Math.floor(recording.elapsedMs / 1000)}s ·{" "}
            {recording.log?.measurements.length ?? 0} samples
          </p>
          <button
            className={`eye-button ${EyeButtonStyles} primary`}
            onClick={() => void recorder.stop()}
          >
            <Square size={15} aria-hidden="true" /> Stop
          </button>
        </>
      ) : (
        <button
          className={`eye-button ${EyeButtonStyles} primary`}
          disabled={!!recordDisabledReason}
          title={
            recordDisabledReason ||
            "Record gaze overlays, pupil tracking and coordinates"
          }
          aria-description={recordDisabledReason || undefined}
          onClick={start}
        >
          {recordingActionIcon}
          {recordLabel}
        </button>
      )}
      {(recording.error || exportError) && (
        <p className="eye-error" role="alert">
          {recording.error || exportError}
        </p>
      )}
      {recording.log && !recording.recording && !recording.finalizing && (
        <div className={`scene-downloads ${SceneDownloadsStyles}`}>
          {recording.sceneUrl && (
            <a
              className={`eye-button ${EyeButtonStyles} secondary`}
              href={recording.sceneUrl}
              download={`scene-gaze.${recording.sceneVideo!.extension}`}
            >
              <Download size={16} aria-hidden="true" /> Scene + gaze
            </a>
          )}
          {recording.eyeUrl && (
            <a
              className={`eye-button ${EyeButtonStyles} secondary`}
              href={recording.eyeUrl}
              download={`eye-tracking.${recording.eyeVideo!.extension}`}
            >
              <Download size={16} aria-hidden="true" /> Eye + pupil
            </a>
          )}
          <button
            className={`eye-button ${EyeButtonStyles} secondary`}
            onClick={() =>
              download(
                new Blob([exportSessionCsv(recording.log!)], {
                  type: "text/csv",
                }),
                "scene-gaze.csv"
              )
            }
          >
            <FileSpreadsheet size={16} aria-hidden="true" /> CSV
          </button>
          <button
            className={`eye-button ${EyeButtonStyles} secondary`}
            onClick={() =>
              download(
                new Blob([exportSessionJson(recording.log!)], {
                  type: "application/json",
                }),
                "scene-session.json"
              )
            }
          >
            <FileJson size={16} aria-hidden="true" /> JSON
          </button>
          <button
            className={`eye-button ${EyeButtonStyles} secondary`}
            disabled={
              !recording.background ||
              !recording.log.measurements.some((m) => m.valid)
            }
            onClick={() => void heatmap()}
          >
            <ChartNoAxesCombined size={16} aria-hidden="true" /> Heatmap
          </button>
          <button
            className={`eye-text-button ${EyeTextButtonStyles}`}
            onClick={() => {
              recorder.clear()
              setHeatmapUrl(null)
            }}
          >
            <Trash2 size={15} aria-hidden="true" /> Clear
          </button>
        </div>
      )}
      {heatmapUrl && (
        <figure className={`scene-heatmap ${SceneHeatmapStyles}`}>
          <img
            src={heatmapUrl}
            alt="Accumulated dwell-weighted gaze density in scene camera coordinates"
          />
        </figure>
      )}
    </div>
  )
}
