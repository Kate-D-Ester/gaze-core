export type RecordingResult = {
  blob: Blob
  mimeType: string
  extension: "mp4" | "webm"
  startedAt: number
  endedAt: number
  error: string
  capture: "canvas-reencode" | "usb-track"
}
export type RecordingOptions = {
  maxBytes?: number
  limitMs?: number
  stream?: MediaStream | null
  onLimit?: () => void
  onStopped?: (result: RecordingResult) => void
}
export type RecordingController = {
  start: () => void
  stop: () => Promise<RecordingResult>
  dispose: () => void
}
const MIMES = ["video/webm;codecs=vp8", "video/webm", "video/mp4"]
export function createSceneRecording(
  canvas: HTMLCanvasElement,
  options: RecordingOptions = {}
): RecordingController {
  let recorder: MediaRecorder | null = null,
    stream: MediaStream | null = null,
    startedAt = 0,
    error = "",
    chunks: Blob[] = [],
    bytes = 0,
    timer: ReturnType<typeof setTimeout> | undefined
  let completed: RecordingResult | null = null,
    finishPromise: Promise<RecordingResult> | null = null,
    resolveFinish: ((result: RecordingResult) => void) | null = null,
    stopping = false
  let capture: RecordingResult["capture"] = "canvas-reencode"
  function finalize() {
    if (completed) return
    clearTimeout(timer)
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    const mimeType = recorder?.mimeType || "video/webm"
    completed = {
      blob: new Blob(chunks, { type: mimeType }),
      mimeType,
      extension: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
      startedAt,
      endedAt: performance.now(),
      error,
      capture,
    }
    chunks = []
    resolveFinish?.(completed)
    options.onStopped?.(completed)
  }
  function stop(): Promise<RecordingResult> {
    if (!finishPromise)
      return Promise.reject(new Error("Start a recording first."))
    if (!stopping && !completed) {
      stopping = true
      clearTimeout(timer)
      try {
        if (recorder?.state !== "inactive") recorder?.stop()
        else finalize()
      } catch (cause) {
        error =
          cause instanceof Error
            ? cause.message
            : "The recorder could not stop cleanly."
        finalize()
      }
    }
    return finishPromise
  }
  function limit(reason: string) {
    if (stopping || completed) return
    error = reason
    options.onLimit?.()
    void stop()
  }
  return {
    start() {
      if (finishPromise)
        throw new Error("Create a new recorder for each session.")
      if (typeof MediaRecorder === "undefined")
        throw new Error(
          "This browser cannot record video. You can still save gaze coordinates."
        )
      const mimeType = MIMES.find((mime) => MediaRecorder.isTypeSupported(mime))
      if (!mimeType)
        throw new Error(
          "No supported video recording codec. Use data logging or another browser."
        )
      try {
        if (options.stream) {
          stream = new MediaStream(
            options.stream.getVideoTracks().map((track) => track.clone())
          )
          capture = "usb-track"
        } else {
          if (typeof canvas.captureStream !== "function")
            throw new Error(
              "This browser cannot capture canvas video. You can still save gaze coordinates."
            )
          stream = canvas.captureStream(30)
        }
        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 4000000,
        })
        recorder.ondataavailable = (event) => {
          if (!event.data.size || completed) return
          if (
            bytes + event.data.size >
            (options.maxBytes ?? 128 * 1024 * 1024)
          ) {
            limit(
              "Video size limit reached. Save this session and start another."
            )
            return
          }
          chunks.push(event.data)
          bytes += event.data.size
        }
        recorder.onstop = finalize
        recorder.onerror = (event) => {
          error =
            (event as Event & { error?: Error }).error?.message ||
            "The video encoder stopped unexpectedly."
          void stop()
        }
        startedAt = performance.now()
        finishPromise = new Promise((resolve) => {
          resolveFinish = resolve
        })
        recorder.start(1000)
        timer = setTimeout(
          () =>
            limit(
              "Recording duration limit reached. Save this session and start another."
            ),
          options.limitMs ?? 600000
        )
      } catch (cause) {
        stream?.getTracks().forEach((track) => track.stop())
        stream = null
        finishPromise = null
        resolveFinish = null
        recorder = null
        throw cause
      }
    },
    stop,
    dispose() {
      if (finishPromise && !completed) void stop()
    },
  }
}
