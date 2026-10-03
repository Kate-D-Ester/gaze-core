import type { RecordingController, RecordingOptions } from "./recording"
import { createSceneRecording } from "./recording"
import type { GazeMeasurement, HandObservation } from "./scene.types"
import { appendMeasurement, createSessionLog } from "./session"
import type { SessionRecordingSnapshot } from "./session-recorder.types"
export type { SessionRecordingSnapshot } from "./session-recorder.types"
export class SessionRecorder {
  private snapshot: SessionRecordingSnapshot = {
    recording: false,
    finalizing: false,
    elapsedMs: 0,
    error: "",
    log: null,
    sceneVideo: null,
    eyeVideo: null,
    sceneUrl: null,
    eyeUrl: null,
    background: null,
  }
  private listeners = new Set<() => void>()
  private scene: RecordingController | null = null
  private eye: RecordingController | null = null
  private canvas: HTMLCanvasElement | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private finish: Promise<void> | null = null
  private disposed = false
  private factory: typeof createSceneRecording
  constructor(factory: typeof createSceneRecording = createSceneRecording) {
    this.factory = factory
  }
  getSnapshot = () => this.snapshot
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private update(next: Partial<SessionRecordingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((fn) => fn())
  }
  private revoke() {
    if (this.snapshot.sceneUrl) {
      URL.revokeObjectURL(this.snapshot.sceneUrl)
    }
    if (this.snapshot.eyeUrl) {
      URL.revokeObjectURL(this.snapshot.eyeUrl)
    }
  }
  start(
    canvas: HTMLCanvasElement,
    eyeCanvas: HTMLCanvasElement | null,
    metadata: Record<string, unknown>,
    stream: MediaStream | null,
    withEye: boolean,
    backgroundCanvas: HTMLCanvasElement = canvas
  ) {
    if (this.snapshot.recording || this.snapshot.finalizing) {
      return
    }
    this.disposed = false
    this.revoke()
    this.finish = null
    this.canvas = backgroundCanvas
    const log = createSessionLog(performance.now(), structuredClone(metadata))
    this.update({
      recording: true,
      finalizing: false,
      elapsedMs: 0,
      error: "",
      log,
      sceneVideo: null,
      eyeVideo: null,
      sceneUrl: null,
      eyeUrl: null,
      background: null,
    })
    const maxBytes = withEye ? 64 * 1024 * 1024 : 128 * 1024 * 1024
    const options: RecordingOptions = {
      maxBytes,
      onLimit: () => {
        void this.stop(
          "Recording limit reached. Save this session and start another."
        )
      },
      onStopped: (result) => {
        if (this.snapshot.recording) {
          void this.stop(
            result.error || "Video stopped. The session has been saved."
          )
        }
      },
    }
    try {
      this.scene = this.factory(canvas, { ...options, stream })
      this.scene.start()
    } catch (error) {
      this.scene?.dispose()
      this.scene = null
      this.update({
        error:
          error instanceof Error
            ? error.message
            : "Video unavailable; gaze data will still be logged.",
      })
    }
    if (withEye && eyeCanvas) {
      try {
        this.eye = this.factory(eyeCanvas, options)
        this.eye.start()
      } catch (error) {
        this.eye?.dispose()
        this.eye = null
        this.update({
          error: [
            this.snapshot.error,
            error instanceof Error ? error.message : "Eye video unavailable.",
          ]
            .filter(Boolean)
            .join(" "),
        })
      }
    }
    this.timer = setTimeout(() => {
      void this.stop("Ten-minute recording limit reached.")
    }, 600000)
  }
  observeMeasurement(measurement: GazeMeasurement | null) {
    const log = this.snapshot.log
    if (!this.snapshot.recording || !log || !measurement) {
      return
    }
    appendMeasurement(log, measurement)
    const elapsedMs = Math.max(0, performance.now() - log.startedAt)
    this.update({ elapsedMs })
    if (log.truncated) {
      void this.stop(
        "Coordinate log limit reached. Save this session and start another."
      )
    }
  }
  observeHand(hand: HandObservation | null) {
    const log = this.snapshot.log
    if (
      !this.snapshot.recording ||
      !log ||
      !hand ||
      hand.scene.timestamp < log.startedAt
    ) {
      return
    }
    if (log.hands.at(-1)?.scene.id === hand.scene.id) {
      return
    }
    if (log.hands.length < 18000) {
      log.hands.push(hand)
    }
  }
  stop(reason = ""): Promise<void> {
    if (this.finish) {
      return this.finish
    }
    if (!this.snapshot.recording) {
      return Promise.resolve()
    }
    clearTimeout(this.timer)
    const log = this.snapshot.log!
    log.endedAt = performance.now()
    this.update({
      recording: false,
      finalizing: true,
      elapsedMs: log.endedAt - log.startedAt,
      error: reason || this.snapshot.error,
    })
    let background: HTMLCanvasElement | null = null
    try {
      if (this.canvas) {
        background = document.createElement("canvas")
        background.width = this.canvas.width
        background.height = this.canvas.height
        background.getContext("2d")?.drawImage(this.canvas, 0, 0)
      }
    } catch {
      background = null
    }
    const scene = this.scene
    const eye = this.eye
    this.scene = null
    this.eye = null
    this.finish = (async () => {
      const results = await Promise.allSettled([
        scene?.stop() ?? Promise.resolve(null),
        eye?.stop() ?? Promise.resolve(null),
      ])
      const sceneVideo =
        results[0].status === "fulfilled" ? results[0].value : null
      const eyeVideo =
        results[1].status === "fulfilled" ? results[1].value : null
      const errors = results.flatMap((result) => {
        if (result.status === "rejected") {
          return [String(result.reason)]
        }
        if (result.value?.error) {
          return [result.value.error]
        }
        return []
      })
      log.metadata.videos = {
        scene: sceneVideo
          ? {
              startedAt: sceneVideo.startedAt,
              offsetMs: sceneVideo.startedAt - log.startedAt,
              endedAt: sceneVideo.endedAt,
              mimeType: sceneVideo.mimeType,
              capture: sceneVideo.capture,
            }
          : null,
        eye: eyeVideo
          ? {
              startedAt: eyeVideo.startedAt,
              offsetMs: eyeVideo.startedAt - log.startedAt,
              endedAt: eyeVideo.endedAt,
              mimeType: eyeVideo.mimeType,
              capture: eyeVideo.capture,
            }
          : null,
      }
      this.update({
        finalizing: false,
        sceneVideo,
        eyeVideo,
        background,
        error: [this.snapshot.error, ...errors]
          .filter(
            (value, index, array) => value && array.indexOf(value) === index
          )
          .join(" "),
        sceneUrl:
          !this.disposed && sceneVideo?.blob.size
            ? URL.createObjectURL(sceneVideo.blob)
            : null,
        eyeUrl:
          !this.disposed && eyeVideo?.blob.size
            ? URL.createObjectURL(eyeVideo.blob)
            : null,
      })
    })()
    return this.finish
  }
  clear() {
    if (this.snapshot.recording || this.snapshot.finalizing) {
      return
    }
    this.revoke()
    this.update({
      log: null,
      sceneVideo: null,
      eyeVideo: null,
      sceneUrl: null,
      eyeUrl: null,
      background: null,
      error: "",
      elapsedMs: 0,
    })
  }
  dispose() {
    this.disposed = true
    void this.stop("Recording stopped when this route closed.")
    this.revoke()
    this.update({ sceneUrl: null, eyeUrl: null })
  }
}
