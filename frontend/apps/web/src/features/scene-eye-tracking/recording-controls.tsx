import { useEffect, useState, useSyncExternalStore } from "react"
import type { TrackerController } from "../eye-tracking/use-tracker.types"
import type { SceneCamera } from "./scene-camera"
import type { SceneSessionSnapshot } from "./scene-session"
import type { HandObservation } from "./scene.types"
import { SessionRecorder } from "./session-recorder"
import { exportSessionCsv, exportSessionJson } from "./session"
import { heatmapCanvas } from "./heatmap"

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function RecordingControls({
  camera,
  tracker,
  state,
  hand,
  identity,
}: {
  camera: SceneCamera
  tracker: TrackerController
  state: SceneSessionSnapshot
  hand: HandObservation | null
  identity: string
}) {
  const [recorder] = useState(() => new SessionRecorder()),
    [withEye, setWithEye] = useState(false),
    [heatmapUrl, setHeatmapUrl] = useState<string | null>(null),
    [exportError, setExportError] = useState("")
  const recording = useSyncExternalStore(
    recorder.subscribe,
    recorder.getSnapshot
  )
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
        sceneWidth: camera.latest?.width,
        sceneHeight: camera.latest?.height,
        eye: tracker.source,
        eyeWidth: tracker.frame?.width,
        eyeHeight: tracker.frame?.height,
        settings: tracker.settings,
        eyeModel: tracker.frame?.model,
        calibration: state.calibration,
        validation: state.validation,
        delayMs: state.delayMs,
        synchronization:
          "Browser decode/receipt timestamps; not hardware synchronized",
        heatmap: "Camera-image dwell density; not registered to world objects",
        mediapipe: "0.10.32; hand_landmarker float16 v1",
      },
      camera.stream,
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
  let recordLabel = recording.log
    ? "Start a new session"
    : "Start recording / data log"
  if (recording.finalizing) recordLabel = "Finalizing video…"
  return (
    <div className="scene-recording">
      <h3>Record this session</h3>
      <p className="eye-help">
        Raw scene video, gaze coordinates and hand landmarks stay on this
        device. Heatmaps show dwell in the camera image.
      </p>
      {!recording.recording && (
        <label className="scene-checkbox">
          <input
            type="checkbox"
            checked={withEye}
            onChange={(e) => setWithEye(e.target.checked)}
            disabled={recording.finalizing}
          />
          Also record the raw eye preview
        </label>
      )}
      {recording.recording ? (
        <>
          <p role="status">
            Recording · {Math.floor(recording.elapsedMs / 1000)} seconds ·{" "}
            {recording.log?.measurements.length ?? 0} gaze rows
          </p>
          <button
            className="eye-button primary"
            onClick={() => void recorder.stop()}
          >
            Stop and prepare downloads
          </button>
        </>
      ) : (
        <button
          className="eye-button primary"
          disabled={
            !state.calibration || !camera.latest || recording.finalizing
          }
          onClick={start}
        >
          {recordLabel}
        </button>
      )}
      <small>
        Each session is limited to 10 minutes and 128 MiB of video. A new
        session replaces the previous downloads.
      </small>
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
              Save raw scene video
            </a>
          )}
          {recording.eyeUrl && (
            <a
              className="eye-button secondary"
              href={recording.eyeUrl}
              download={`eye-raw.${recording.eyeVideo!.extension}`}
            >
              Save raw eye video
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
            Save gaze CSV
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
            Save session JSON
          </button>
          <button
            className="eye-button secondary"
            disabled={
              !recording.background ||
              !recording.log.measurements.some((m) => m.valid)
            }
            onClick={() => void heatmap()}
          >
            Generate and save heatmap PNG
          </button>
          <button
            className="eye-text-button"
            onClick={() => {
              recorder.clear()
              setHeatmapUrl(null)
            }}
          >
            Clear this session
          </button>
        </div>
      )}
      {heatmapUrl && (
        <figure className="scene-heatmap">
          <img
            src={heatmapUrl}
            alt="Accumulated dwell-weighted gaze density in scene camera coordinates"
          />
          <figcaption>
            Camera-image dwell density · moves with the headset
          </figcaption>
        </figure>
      )}
    </div>
  )
}
