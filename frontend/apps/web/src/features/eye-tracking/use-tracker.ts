import { useCallback, useEffect, useRef, useState } from "react"
import { openNetworkSource } from "./network-source"
import { shouldIncludePreviewMasks } from "./preview-mask-policy"
import { drawSample } from "./sample"
import type { FrameSettings, Point, TrackingFrame } from "./types"
import type { WorkerRequest } from "./tracker.worker"

export const DEFAULT_SETTINGS: FrameSettings = {
  format: "spatial",
  roi: { x: 0, y: 0, width: 640, height: 480 },
  threshold: 0,
  thresholdMode: "auto",
  fov: 45,
  radiusMm: 12,
  corners: null,
  locked: false,
}
type Source = { kind: "camera" | "network" | "video" | "sample"; name: string }

function jpegBlob(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type: "image/jpeg" })
}

export function useTracker() {
  const [settings, setSettings] = useState<FrameSettings>(DEFAULT_SETTINGS)
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 })
  const [frame, setFrame] = useState<TrackingFrame | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [engineReady, setEngineReady] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null)
  const latest = useRef<TrackingFrame | null>(null)
  const control = useRef({
    settings: DEFAULT_SETTINGS,
    source: null as Source | null,
    video: null as HTMLVideoElement | null,
    mjpegFrame: null as ImageBitmap | null,
    mjpegSequence: 0,
    lastMjpegSequence: -1,
    networkAbort: null as AbortController | null,
    stream: null as MediaStream | null,
    url: "",
    generation: 0,
    sourceEpoch: 0,
    sequence: 0,
    inflight: false,
    inflightGeneration: -1,
    worker: null as Worker | null,
    ready: false,
    previewMasksEnabled: false,
    sampleTarget: null as Point | null,
    blink: false,
    lastVideoTime: -1,
  })
  const clearFrame = useCallback(() => {
    latest.current = null
    setFrame(null)
  }, [])
  const refreshDevices = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.enumerateDevices) return
    try {
      const list = await mediaDevices.enumerateDevices()
      setDevices(list.filter((device) => device.kind === "videoinput"))
    } catch {
      // Camera enumeration can be unavailable until the browser grants access.
    }
  }, [])
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices
    void refreshDevices()
    if (!mediaDevices?.addEventListener) return
    const handleDeviceChange = () => void refreshDevices()
    mediaDevices.addEventListener("devicechange", handleDeviceChange)
    return () =>
      mediaDevices.removeEventListener("devicechange", handleDeviceChange)
  }, [refreshDevices])
  const stop = useCallback(() => {
    const c = control.current
    c.generation++
    c.sourceEpoch++
    c.inflight = false
    c.inflightGeneration = -1
    c.stream?.getTracks().forEach((track) => track.stop())
    c.stream = null
    c.networkAbort?.abort()
    c.networkAbort = null
    c.mjpegFrame?.close()
    c.mjpegFrame = null
    c.mjpegSequence = 0
    c.lastMjpegSequence = -1
    if (c.video) {
      c.video.pause()
      c.video.srcObject = null
      c.video.removeAttribute("src")
      c.video.load()
      c.video = null
    }
    if (c.url) URL.revokeObjectURL(c.url)
    c.url = ""
    c.source = null
    c.lastVideoTime = -1
    c.sampleTarget = null
    c.settings = { ...c.settings, locked: false, corners: null }
    setSettings(c.settings)
    if (sourceCanvas.current) {
      const canvas = sourceCanvas.current
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
    }
    setSource(null)
    setBusy(false)
    clearFrame()
  }, [clearFrame])
  const configure = useCallback(
    (next: Partial<FrameSettings>, invalidate = true) => {
      const c = control.current
      c.settings = {
        ...c.settings,
        ...next,
        ...(invalidate ? { locked: false } : {}),
      }
      if (invalidate) {
        c.generation++
        c.inflight = false
        c.inflightGeneration = -1
        clearFrame()
      }
      setSettings(c.settings)
    },
    [clearFrame]
  )
  const activate = useCallback(
    (
      next: Source,
      video: HTMLVideoElement | null,
      frameSize?: { width: number; height: number }
    ) => {
      const c = control.current
      const inputWidth = video?.videoWidth ?? frameSize?.width ?? 640
      const inputHeight = video?.videoHeight ?? frameSize?.height ?? 480
      const scale =
        video || frameSize
          ? Math.min(1280 / inputWidth, 960 / inputHeight, 1)
          : 1
      const width =
          video || frameSize
            ? Math.max(2, Math.round(inputWidth * scale))
            : 640,
        height =
          video || frameSize
            ? Math.max(2, Math.round(inputHeight * scale))
            : 480
      c.settings = {
        ...c.settings,
        roi: { x: 0, y: 0, width, height },
        corners: null,
        locked: false,
      }
      c.video = video
      c.source = next
      const canvas = sourceCanvas.current ?? document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      sourceCanvas.current = canvas
      setDimensions({ width, height })
      setSettings(c.settings)
      setSource(next)
      setBusy(false)
    },
    []
  )
  const startCamera = useCallback(
    async (deviceId: string) => {
      stop()
      setBusy(true)
      setError("")
      const c = control.current,
        generation = c.sourceEpoch
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access needs localhost or HTTPS in a supported browser."
          )
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (generation !== c.sourceEpoch) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        c.stream = stream
        const video = document.createElement("video")
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        c.video = video
        await video.play()
        await waitForDimensions(video)
        if (generation !== c.sourceEpoch) return
        activate(
          {
            kind: "camera",
            name: stream.getVideoTracks()[0]?.label || "Camera",
          },
          video
        )
        stream.getVideoTracks()[0]?.addEventListener(
          "ended",
          () => {
            if (c.stream === stream) {
              stop()
              setError("Camera disconnected. Reconnect it and start again.")
            }
          },
          { once: true }
        )
        void refreshDevices()
      } catch (cause) {
        if (generation === c.sourceEpoch) {
          stop()
          setError(cameraError(cause))
        }
      }
    },
    [stop, activate, refreshDevices]
  )
  const startNetworkStream = useCallback(
    async (input: string) => {
      stop()
      setBusy(true)
      setError("")
      const c = control.current,
        generation = c.sourceEpoch
      try {
        const abort = new AbortController()
        c.networkAbort = abort
        const networkSource = await openNetworkSource(input, abort.signal)
        if (generation !== c.sourceEpoch) {
          if (networkSource.kind === "mjpeg") {
            await networkSource.frames.return(undefined)
          } else {
            networkSource.video.pause()
            networkSource.video.removeAttribute("src")
            networkSource.video.load()
          }
          return
        }

        if (networkSource.kind === "video") {
          activate(
            { kind: "network", name: networkSource.name },
            networkSource.video
          )
          networkSource.video.addEventListener(
            "error",
            () => {
              if (c.video === networkSource.video) {
                stop()
                setError(
                  "This network video stopped. Check its stream URL and CORS settings."
                )
              }
            },
            { once: true }
          )
          return
        }

        const firstBitmap = await createImageBitmap(
          jpegBlob(networkSource.firstFrame)
        )
        if (generation !== c.sourceEpoch) {
          firstBitmap.close()
          await networkSource.frames.return(undefined)
          return
        }
        c.mjpegFrame = firstBitmap
        c.mjpegSequence++
        c.lastMjpegSequence = -1
        activate({ kind: "network", name: networkSource.name }, null, {
          width: firstBitmap.width,
          height: firstBitmap.height,
        })

        void (async () => {
          try {
            for await (const jpeg of networkSource.frames) {
              if (generation !== c.sourceEpoch) return
              const bitmap = await createImageBitmap(jpegBlob(jpeg))
              if (generation !== c.sourceEpoch) {
                bitmap.close()
                return
              }
              const previous = c.mjpegFrame
              c.mjpegFrame = bitmap
              c.mjpegSequence++
              previous?.close()
            }
            if (generation === c.sourceEpoch) {
              stop()
              setError("The camera stream ended. Reconnect it and try again.")
            }
          } catch (cause) {
            if (generation === c.sourceEpoch && !abort.signal.aborted) {
              stop()
              setError(
                cause instanceof Error
                  ? cause.message
                  : "The camera stream stopped unexpectedly."
              )
            }
          }
        })()
      } catch (cause) {
        if (generation === c.sourceEpoch) {
          stop()
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load the network stream."
          )
        }
      }
    },
    [stop, activate]
  )
  const startVideo = useCallback(
    async (file: File) => {
      stop()
      setBusy(true)
      setError("")
      const c = control.current,
        generation = c.sourceEpoch
      try {
        c.url = URL.createObjectURL(file)
        const video = document.createElement("video")
        video.muted = true
        video.playsInline = true
        video.loop = true
        video.src = c.url
        c.video = video
        await video.play()
        await waitForDimensions(video)
        if (generation !== c.sourceEpoch) return
        activate({ kind: "video", name: file.name }, video)
      } catch (cause) {
        if (generation === c.sourceEpoch) {
          stop()
          setError(
            cause instanceof Error
              ? cause.message
              : "This video could not be decoded. Try an MP4 or WebM file."
          )
        }
      }
    },
    [stop, activate]
  )
  const startSample = useCallback(() => {
    stop()
    setError("")
    activate({ kind: "sample", name: "Synthetic eye sample" }, null)
  }, [stop, activate])
  const setSampleTarget = useCallback((point: Point | null) => {
    control.current.sampleTarget = point
  }, [])
  const setPreviewMasksEnabled = useCallback((enabled: boolean) => {
    control.current.previewMasksEnabled = enabled
  }, [])
  const setBlink = useCallback((value: boolean) => {
    control.current.blink = value
  }, [])
  useEffect(() => {
    const c = control.current
    const worker = new Worker(new URL("./tracker.worker.ts", import.meta.url), {
      type: "module",
    })
    c.worker = worker
    const fail = (message: string) => {
      c.ready = false
      c.inflight = false
      setEngineReady(false)
      setError(message)
      stop()
    }
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data
      if (message.type === "ready") {
        c.ready = true
        setEngineReady(true)
        return
      }
      if (
        message.generation !== undefined &&
        message.generation !== c.generation
      ) {
        if (message.generation === c.inflightGeneration) {
          c.inflight = false
          c.inflightGeneration = -1
        }
        return
      }
      c.inflight = false
      c.inflightGeneration = -1
      if (message.type === "error") {
        fail(message.message)
        return
      }
      if (message.type === "frame") {
        const canvas = sourceCanvas.current
        if (canvas)
          canvas
            .getContext("2d")
            ?.putImageData(
              new ImageData(
                message.data,
                message.frame.width,
                message.frame.height
              ),
              0,
              0
            )
        if (!c.previewMasksEnabled) {
          previewMasks = []
          previewMaskGeneration = message.generation
        } else if (previewMaskGeneration !== message.generation) {
          previewMaskGeneration = message.generation
          previewMasks = []
        }
        const previews = message.frame.detection.previews.map(
          (
            preview: TrackingFrame["detection"]["previews"][number],
            index: number
          ) => {
            if (!c.previewMasksEnabled) {
              if (!preview.mask) return preview
              return {
                label: preview.label,
                threshold: preview.threshold,
                score: preview.score,
              }
            }
            if (preview.mask) previewMasks[index] = preview.mask
            const mask = preview.mask ?? previewMasks[index]
            return mask && !preview.mask ? { ...preview, mask } : preview
          }
        )
        const frame = {
          ...message.frame,
          detection: { ...message.frame.detection, previews },
        } as TrackingFrame
        latest.current = frame
        setFrame(frame)
      }
    }
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault()
      fail(
        event.message
          ? `The vision engine stopped: ${event.message}`
          : "The vision engine stopped unexpectedly. Restart the camera and try again."
      )
    }
    worker.onmessageerror = () =>
      fail("The vision engine returned data the page could not read.")
    const captureCanvas = document.createElement("canvas")
    let raf = 0,
      last = 0,
      lastPreviewMaskFrame = -Infinity,
      previewMaskRequestGeneration = -1,
      previewMaskGeneration = -1,
      previewMasks: (Uint8Array | undefined)[] = []
    const loop = (time: number) => {
      raf = requestAnimationFrame(loop)
      if (!c.source || !c.ready || c.inflight || time - last < 1000 / 24) return
      const display = sourceCanvas.current
      if (!display) return
      const canvas = captureCanvas
      if (canvas.width !== display.width || canvas.height !== display.height) {
        canvas.width = display.width
        canvas.height = display.height
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      if (c.source.kind === "sample")
        drawSample(ctx, time, c.sampleTarget, c.blink)
      else if (c.mjpegFrame) {
        if (c.lastMjpegSequence === c.mjpegSequence) {
          if (latest.current && time - latest.current.timestamp > 700)
            clearFrame()
          return
        }
        c.lastMjpegSequence = c.mjpegSequence
        ctx.drawImage(c.mjpegFrame, 0, 0, canvas.width, canvas.height)
      } else {
        if (
          !c.video ||
          c.video.readyState < 2 ||
          c.video.currentTime === c.lastVideoTime
        ) {
          if (latest.current && time - latest.current.timestamp > 700)
            clearFrame()
          return
        }
        c.lastVideoTime = c.video.currentTime
        ctx.drawImage(c.video, 0, 0, canvas.width, canvas.height)
      }
      last = time
      if (previewMaskRequestGeneration !== c.generation) {
        previewMaskRequestGeneration = c.generation
        lastPreviewMaskFrame = -Infinity
      }
      // Segmentation runs every frame; the large visualization masks need only
      // refresh five times per second.
      const includePreviewMasks = shouldIncludePreviewMasks(
        c.previewMasksEnabled,
        time,
        lastPreviewMaskFrame
      )
      if (includePreviewMasks) lastPreviewMaskFrame = time
      const request: WorkerRequest = {
        type: "frame",
        data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        width: canvas.width,
        height: canvas.height,
        settings: c.settings,
        id: ++c.sequence,
        timestamp: time,
        generation: c.generation,
        includePreviewMasks,
        evaluateAllThresholds: c.previewMasksEnabled,
      }
      c.inflight = true
      c.inflightGeneration = c.generation
      worker.postMessage(request, [request.data.buffer])
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      worker.terminate()
      c.ready = false
      c.worker = null
      c.generation++
      c.sourceEpoch++
      c.networkAbort?.abort()
      c.networkAbort = null
      c.stream?.getTracks().forEach((t) => t.stop())
      c.mjpegFrame?.close()
      c.mjpegFrame = null
      c.video?.pause()
      if (c.video) c.video.srcObject = null
      if (c.url) URL.revokeObjectURL(c.url)
    }
  }, [stop, clearFrame])
  return {
    dimensions,
    settings,
    configure,
    frame,
    latest,
    source,
    sourceCanvas,
    busy,
    error,
    setError,
    engineReady,
    devices,
    startCamera,
    startNetworkStream,
    startVideo,
    startSample,
    stop,
    setSampleTarget,
    setPreviewMasksEnabled,
    setBlink,
  }
}
function waitForDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth && video.videoHeight) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener("loadeddata", done)
      video.removeEventListener("error", failed)
    }
    const done = () => {
      cleanup()
      if (video.videoWidth) resolve()
      else reject(new Error("Video has no image data."))
    }
    const failed = () => {
      cleanup()
      reject(new Error("Unable to read this video source."))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(
        new Error("Video did not become ready. Try reconnecting the camera.")
      )
    }, 15000)
    video.addEventListener("loadeddata", done, { once: true })
    video.addEventListener("error", failed, { once: true })
  })
}
function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "Camera permission was denied. Allow camera access in your browser, then retry."
    if (error.name === "NotFoundError")
      return "No camera found. Connect a camera or open a recorded eye video."
    if (error.name === "NotReadableError")
      return "Camera is in use. Close the other camera app and retry."
  }
  return error instanceof Error ? error.message : "Unable to start the camera."
}
export type TrackerController = ReturnType<typeof useTracker>
