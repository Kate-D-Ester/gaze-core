import { useCallback, useEffect, useRef, useState } from "react"
import { openNetworkSource } from "./network-source"
import { useTrackerWorker } from "./use-tracker-worker"
import {
  getCameraErrorMessage,
  getVideoErrorMessage,
  waitForVideoDimensions,
} from "./video-source"
import {
  readTrackerPreferences,
  resizeTrackerSettings,
  saveTrackerPreferences,
} from "./tracker-preferences"
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
const DEFAULT_DIMENSIONS: FrameDimensions = { width: 640, height: 480 }

function defaultSettingsFor(
  format: FrameSettings["format"],
  dimensions: FrameDimensions
): FrameSettings {
  const classic = format === "classic"
  return {
    ...DEFAULT_SETTINGS,
    format,
    roi: { x: 0, y: 0, ...dimensions },
    threshold: classic ? 50 : 0,
    thresholdMode: classic ? "manual" : "auto",
  }
}

function jpegBlob(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type: "image/jpeg" })
}

export function useTracker(): TrackerController {
  const [preferences] = useState(readTrackerPreferences)
  const preferencesRef = useRef(preferences)
  const activeFormat = "spatial"
  const savedSettings = preferences[activeFormat]
  const initialDimensions = savedSettings?.frameDimensions ?? DEFAULT_DIMENSIONS
  const [settings, setSettings] = useState<FrameSettings>(() =>
    savedSettings
      ? { ...savedSettings.settings, locked: false }
      : defaultSettingsFor(activeFormat, initialDimensions)
  )
  const [dimensions, setDimensions] =
    useState<FrameDimensions>(initialDimensions)
  const dimensionsRef = useRef(dimensions)
  const [frame, setFrame] = useState<TrackingFrame | null>(null)
  const [source, setSource] = useState<TrackerSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [engineReady, setEngineReady] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    preferencesRef.current = saveTrackerPreferences(
      preferencesRef.current,
      settings,
      dimensions
    )
  }, [dimensions, settings])
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null)
  const latest = useRef<TrackingFrame | null>(null)
  const control = useRef<TrackerRuntimeState>({
    settings,
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
    // The worker still owns any submitted frame. Its stale response releases
    // that request before a restarted source can submit the next frame.
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
    c.settings = { ...c.settings, locked: false }
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
      const changingFormat = !!next.format && next.format !== c.settings.format
      let nextSettings: FrameSettings
      if (changingFormat && next.format) {
        preferencesRef.current = saveTrackerPreferences(
          preferencesRef.current,
          c.settings,
          dimensionsRef.current
        )
        const saved = preferencesRef.current[next.format]
        const nextDimensions = c.source
          ? dimensionsRef.current
          : (saved?.frameDimensions ?? dimensionsRef.current)
        let baseSettings: FrameSettings
        if (saved && c.source) {
          baseSettings = resizeTrackerSettings(saved, nextDimensions)
        } else if (saved) {
          baseSettings = { ...saved.settings, locked: false }
        } else {
          baseSettings = defaultSettingsFor(next.format, nextDimensions)
        }
        nextSettings = { ...baseSettings, ...next }
        if (!c.source && saved) {
          dimensionsRef.current = saved.frameDimensions
          setDimensions(saved.frameDimensions)
        }
      } else {
        nextSettings = { ...c.settings, ...next }
      }
      c.settings = {
        ...nextSettings,
        ...(invalidate ? { locked: false } : {}),
      }
      if (changingFormat) {
        preferencesRef.current = saveTrackerPreferences(
          preferencesRef.current,
          c.settings,
          dimensionsRef.current
        )
      }
      if (invalidate) {
        c.generation++
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
      const inputWidth =
        video?.videoWidth ?? frameSize?.width ?? DEFAULT_DIMENSIONS.width
      const inputHeight =
        video?.videoHeight ?? frameSize?.height ?? DEFAULT_DIMENSIONS.height
      const scale =
        video || frameSize
          ? Math.min(
              DEFAULT_DIMENSIONS.width / inputWidth,
              DEFAULT_DIMENSIONS.height / inputHeight,
              1
            )
          : 1
      const width =
          video || frameSize
            ? Math.max(2, Math.round(inputWidth * scale))
            : DEFAULT_DIMENSIONS.width,
        height =
          video || frameSize
            ? Math.max(2, Math.round(inputHeight * scale))
            : DEFAULT_DIMENSIONS.height
      c.settings = resizeTrackerSettings(
        {
          frameDimensions: dimensionsRef.current,
          settings: c.settings,
        },
        { width, height }
      )
      c.video = video
      c.source = next
      const canvas = sourceCanvas.current ?? document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      sourceCanvas.current = canvas
      dimensionsRef.current = { width, height }
      setDimensions(dimensionsRef.current)
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
            width: { ideal: DEFAULT_DIMENSIONS.width },
            height: { ideal: DEFAULT_DIMENSIONS.height },
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
            deviceId: stream.getVideoTracks()[0]?.getSettings?.().deviceId,
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
