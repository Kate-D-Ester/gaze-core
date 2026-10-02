import { useEffect, useState, useSyncExternalStore } from "react"
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
import { HelpTip } from "../eye-tracking/components/help-tip"
import type { TrackerController } from "../eye-tracking/use-tracker.types"
import type { SceneCamera } from "./scene-camera"
import type { SceneSessionSnapshot } from "./scene-session"
import { hasCurrentAccuracyCheck } from "./scene-session"
import type { HandObservation } from "./scene.types"
import { SessionRecorder } from "./session-recorder"
import { exportSessionCsv, exportSessionJson } from "./session"
import { heatmapCanvas } from "./heatmap"
import { isDefaultCameraTransform } from "../eye-tracking/camera-transform"
import { download } from "./download"
export function RecordingControls({
  camera,
  tracker,
  state,
  hand,
  identity,
  onRecordingChange,
}: {
  camera: SceneCamera
  tracker: TrackerController
  state: SceneSessionSnapshot
  hand: HandObservation | null
  identity: string
  onRecordingChange?: (recording: boolean) => void
}) {
  const [recorder] = useState(() => new SessionRecorder()),
    [withEye, setWithEye] = useState(false),
    [heatmapUrl, setHeatmapUrl] = useState<string | null>(null),
    [exportError, setExportError] = useState("")
  const recording = useSyncExternalStore(
    recorder.subscribe,
    recorder.getSnapshot
  )
  const canRecord =
    !!state.calibration &&
    !state.capture &&
    (hasCurrentAccuracyCheck(state) || state.method === "one-point")
  useEffect(() => {
    onRecordingChange?.(recording.recording || recording.finalizing)
  }, [onRecordingChange, recording.recording, recording.finalizing])
  useEffect(() => {
    void recorder.stop(
      "Camera or eye setup changed. Save the completed session before recording again."
    )
  }, [identity, recorder])
  useEffect(() => {
    if (!state.calibration)
      void recorder.stop("Calibration changed. The recording was finalized.")
  }, [state.calibration, recorder])
  useEffect(() => {
    if (!canRecord)
      void recorder.stop(
        "Accuracy needs to be checked before continuing recording."
      )
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
      if (heatmapUrl) URL.revokeObjectURL(heatmapUrl)
    },
    [heatmapUrl]
  )
  function start() {
    setHeatmapUrl(null)
    setExportError("")
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
        accuracy: hasCurrentAccuracyCheck(state)
          ? "independently-checked"
          : "one-point-estimate",
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
      const log = recording.log,
        background = recording.background
      if (!log || !background) return
      const canvas = heatmapCanvas(log.measurements, background),
        blob = await new Promise<Blob>((resolve, reject) =>
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
  if (recording.finalizing) recordLabel = "Saving…"
  return (
    <div className="scene-recording">
      <div className="eye-guidance-row">
        <h3>Recording</h3>
        <HelpTip
          label="Recording help"
          text="Video, gaze coordinates and hand landmarks stay on this device. Heatmaps show dwell in the camera image. Sessions stop at 10 minutes or 128 MiB. A new recording replaces previous downloads."
        />
      </div>
      {!recording.recording && (
        <label className="scene-checkbox">
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
            className="eye-button primary"
            onClick={() => void recorder.stop()}
          >
            <Square size={15} aria-hidden="true" /> Stop
          </button>
        </>
      ) : (
        <button
          className="eye-button primary"
          disabled={!canRecord || !camera.latest || recording.finalizing}
          onClick={start}
        >
          {recording.finalizing ? (
            <LoaderCircle
              className="camera-spinner"
              size={16}
              aria-hidden="true"
            />
          ) : (
            <Video size={16} aria-hidden="true" />
          )}
          {recordLabel}
        </button>
      )}
      {(recording.error || exportError) && (
        <p className="eye-error" role="alert">
          {recording.error || exportError}
        </p>
      )}
      {recording.log && !recording.recording && !recording.finalizing && (
        <div className="scene-downloads">
          {recording.sceneUrl && (
            <a
              className="eye-button secondary"
              href={recording.sceneUrl}
              download={`scene-raw.${recording.sceneVideo!.extension}`}
            >
              <Download size={16} aria-hidden="true" /> Scene video
            </a>
          )}
          {recording.eyeUrl && (
            <a
              className="eye-button secondary"
              href={recording.eyeUrl}
              download={`eye-raw.${recording.eyeVideo!.extension}`}
            >
              <Download size={16} aria-hidden="true" /> Eye video
            </a>
          )}
          <button
            className="eye-button secondary"
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
            className="eye-button secondary"
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
            className="eye-button secondary"
            disabled={
              !recording.background ||
              !recording.log.measurements.some((m) => m.valid)
            }
            onClick={() => void heatmap()}
          >
            <ChartNoAxesCombined size={16} aria-hidden="true" /> Heatmap
          </button>
          <button
            className="eye-text-button"
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
        <figure className="scene-heatmap">
          <img
            src={heatmapUrl}
            alt="Accumulated dwell-weighted gaze density in scene camera coordinates"
          />
        </figure>
      )}
    </div>
  )
}
