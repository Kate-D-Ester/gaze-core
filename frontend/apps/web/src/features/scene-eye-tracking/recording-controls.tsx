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
import { useEffect, useState, useSyncExternalStore } from "react"
import { isDefaultCameraTransform } from "../eye-tracking/camera-transform"
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
import type { RecordingControlsProps } from "./recording-controls.types"
import {
  canUseSceneCalibration,
  hasCurrentAccuracyCheck,
} from "./scene-session"
import { exportSessionCsv, exportSessionJson } from "./session"
import { SessionRecorder } from "./session-recorder"
export function RecordingControls({
  camera,
  tracker,
  state,
  hand,
  identity,
  onRecordingChange,
}: RecordingControlsProps) {
  const [recorder] = useState(() => new SessionRecorder())
  const [withEye, setWithEye] = useState(false)
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null)
  const [exportError, setExportError] = useState("")
  const recording = useSyncExternalStore(
    recorder.subscribe,
    recorder.getSnapshot
  )
  const canRecord = !state.capture && canUseSceneCalibration(state)
  useEffect(() => {
    onRecordingChange?.(recording.recording || recording.finalizing)
  }, [onRecordingChange, recording.recording, recording.finalizing])
  useEffect(() => {
    void recorder.stop(
      "Camera or eye setup changed. Save the completed session before recording again."
    )
  }, [identity, recorder])
  useEffect(() => {
    if (!state.calibration) {
      void recorder.stop("Calibration changed. The recording was finalized.")
    }
  }, [state.calibration, recorder])
  useEffect(() => {
    if (!canRecord) {
      void recorder.stop(
        "Accuracy needs to be checked before continuing recording."
      )
    }
  }, [canRecord, recorder])
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
  useEffect(
    () => () => {
      if (heatmapUrl) {
        URL.revokeObjectURL(heatmapUrl)
      }
    },
    [heatmapUrl]
  )
  function start() {
    setHeatmapUrl(null)
    setExportError("")
    let accuracy = "one-point-estimate"
    if (hasCurrentAccuracyCheck(state)) {
      accuracy = "independently-checked"
    } else if (state.reusedCalibration) {
      accuracy = "reused-calibration-not-rechecked"
    }
    recorder.start(
      camera.rawCanvas,
      tracker.sourceCanvas.current,
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
        validation: state.validation,
        gazeOffset: { normalized: state.offset },
        delayMs: state.delayMs,
        synchronization:
          "Browser decode/receipt timestamps; not hardware synchronized",
        heatmap: "Camera-image dwell density; not registered to world objects",
        mediapipe: "0.10.32; hand_landmarker float16 v1",
      },
      isDefaultCameraTransform(camera.getSnapshot().transform)
        ? camera.stream
        : null,
      withEye
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
      <div className={`eye-guidance-row ${EyeGuidanceRowStyles}`}>
        <h3>Recording</h3>
        <HelpTip
          label="Recording help"
          text="Video, gaze coordinates and hand landmarks stay on this device. Heatmaps show dwell in the camera image. Sessions stop at 10 minutes or 128 MiB. A new recording replaces previous downloads."
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
          Include eye video
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
          disabled={!canRecord || !camera.latest || recording.finalizing}
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
              download={`scene-raw.${recording.sceneVideo!.extension}`}
            >
              <Download size={16} aria-hidden="true" /> Scene video
            </a>
          )}
          {recording.eyeUrl && (
            <a
              className={`eye-button ${EyeButtonStyles} secondary`}
              href={recording.eyeUrl}
              download={`eye-raw.${recording.eyeVideo!.extension}`}
            >
              <Download size={16} aria-hidden="true" /> Eye video
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
