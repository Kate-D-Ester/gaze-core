import { useCallback, useEffect, useRef, useState } from "react"
import { openNetworkSource } from "./network-source"
import { useTrackerWorker } from "./use-tracker-worker"
import {
  getCameraErrorMessage,
  getVideoErrorMessage,
  waitForVideoDimensions,
} from "./video-source"
import type {
  FrameDimensions,
  FrameSettings,
  Point,
  TrackingFrame,
} from "./eye-tracking.types"
import type {
  TrackerController,
  TrackerRuntimeState,
  TrackerSource,
} from "./use-tracker.types"

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
function jpegBlob(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type: "image/jpeg" })
}

export function useTracker(): TrackerController {
  const [settings, setSettings] = useState<FrameSettings>(DEFAULT_SETTINGS)
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 })
  const [frame, setFrame] = useState<TrackingFrame | null>(null)
  const [source, setSource] = useState<TrackerSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [engineReady, setEngineReady] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null)
  const latest = useRef<TrackingFrame | null>(null)
  const control = useRef<TrackerRuntimeState>({
    settings: DEFAULT_SETTINGS,
    source: null,
    video: null,
    mjpegFrame: null,
    mjpegSequence: 0,
    lastMjpegSequence: -1,
    networkAbort: null,
    stream: null,
    url: "",
    generation: 0,
    sourceEpoch: 0,
    sequence: 0,
    inflight: false,
    inflightGeneration: -1,
    worker: null,
    ready: false,
    previewMasksEnabled: false,
    sampleTarget: null,
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
      next: TrackerSource,
      video: HTMLVideoElement | null,
      frameSize?: FrameDimensions
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
        await waitForVideoDimensions(video)
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
          setError(getCameraErrorMessage(cause))
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
        await waitForVideoDimensions(video)
        if (generation !== c.sourceEpoch) return
        activate({ kind: "video", name: file.name }, video)
      } catch (cause) {
        if (generation === c.sourceEpoch) {
          stop()
          setError(getVideoErrorMessage(cause))
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

  useTrackerWorker({ control, latest }, sourceCanvas, {
    clearFrame,
    stop,
    setEngineReady,
    setError,
    setFrame,
  })

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
