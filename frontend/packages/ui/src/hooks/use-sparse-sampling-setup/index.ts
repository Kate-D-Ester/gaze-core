import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from "react"
import type { RoiRect } from "../../lib/gaze-core/types"
import { components } from "../../lib/gaze-core/image"
import { clamp } from "../../lib/gaze-core/math"
import { normalizeRoi } from "../../lib/gaze-core/roi"
import { usbConstraints, waitForVideo } from "../../lib/gaze-core/source"
import { testEyeTrackerStorage } from "../../lib/gaze-core-widget-storage"
import { drawRoiOverlay } from "../../lib/gaze-core-widget-utils"
import type { GazeCoreWidgetOptions } from "../use-gaze-core-setup"

type SparseSamplingStep = "source" | "roi" | "sampling" | "pupil"

type SparseSamplingPoint = {
  rowIndex: number
  columnIndex: number
  localOrigin: [number, number]
  globalOrigin: [number, number]
  size: {
    width: number
    height: number
  }
  localCenter: [number, number]
  globalCenter: [number, number]
  average: number
  darkestPixel: {
    local: [number, number]
    global: [number, number]
    value: number
  }
  darkSupport: number
  confidence: number
  selectionScore: number
}

type SparseSamplingResult = {
  roi: RoiRect
  sampleColumns: number
  sampleRows: number
  samples: SparseSamplingPoint[]
  darkestSample: SparseSamplingPoint | null
  darkestPixel: {
    local: [number, number]
    global: [number, number]
    value: number
  }
  seedConfidence: number
  lockedToPrevious: boolean
  trackingStatus: "contour" | "estimated"
  pupilContour: PupilContourResult | null
}

type PupilContourResult = {
  threshold: number
  pupilPixelCount: number
  contourPointCount: number
  componentCenter: [number, number]
  globalCenter: [number, number]
  boundingBox: RoiRect
  globalBoundingBox: RoiRect
  confidence: number
  mask: {
    width: number
    height: number
    data: Uint8Array
  }
}

type ThresholdCandidate = {
  threshold: number
  area: number
  contourPointCount: number
  center: [number, number]
  bbox: RoiRect
  componentMask: Uint8Array
  score: number
  confidence: number
}

type RoiDrag = {
  active: boolean
  handleIndex: number
}

type NumericCapability = {
  min: number
  max: number
  step?: number
}

type CameraExposureState = {
  supported: boolean
  modeSupported: boolean
  manualSupported: boolean
  autoSupported: boolean
  exposureTimeSupported: boolean
  modes: string[]
  mode: string
  exposureTime: number | null
  exposureTimeRange: NumericCapability | null
  iso: number | null
  exposureCompensation: number | null
  error: string
}

const STEPS: SparseSamplingStep[] = ["source", "roi", "sampling", "pupil"]
const SPARSE_BLOCK_SIZE = 5
const MIN_SEED_CONFIDENCE = 0.55
const MIN_PUPIL_CONTOUR_CONFIDENCE = 0.55
const DETECTION_INTERVAL_MS = 90
const PUPIL_DETECTION_INTERVAL_MS = 180
const FAST_CONTOUR_SEARCH = {
  iterations: 5,
  refineRadius: 9,
  refineStep: 6,
}
const FULL_CONTOUR_SEARCH = {
  iterations: 9,
  refineRadius: 18,
  refineStep: 3,
}

const DEFAULT_EXPOSURE_STATE: CameraExposureState = {
  supported: false,
  modeSupported: false,
  manualSupported: false,
  autoSupported: false,
  exposureTimeSupported: false,
  modes: [],
  mode: "unknown",
  exposureTime: null,
  exposureTimeRange: null,
  iso: null,
  exposureCompensation: null,
  error: "",
}

type StableSeed = {
  localCenter: [number, number]
  darkestPixel: {
    local: [number, number]
    global: [number, number]
    value: number
  }
  roi: RoiRect
  confidence: number
  pupilContour: PupilContourResult | null
}

type PupilCandidate = {
  sample: SparseSamplingPoint
  contour: PupilContourResult | null
  score: number
  confidence: number
}

type ContourSearchOptions = typeof FULL_CONTOUR_SEARCH

export function useSparseSamplingSetupWidget(_options: GazeCoreWidgetOptions = {}) {
  const savedPrefs = testEyeTrackerStorage.readPrefs()
  const [currentStep, setCurrentStep] = useState<SparseSamplingStep>("source")
  const [kind, setKind] = useState<"usb" | "network">(savedPrefs.kind)
  const [source, setSource] = useState(savedPrefs.source)
  const [roi, setRoi] = useState<RoiRect>(savedPrefs.roi)
  const [previewActive, setPreviewActive] = useState(false)
  const [previewError, setPreviewError] = useState("")
  const [exposureState, setExposureState] = useState<CameraExposureState>(DEFAULT_EXPOSURE_STATE)
  const [latestSamplingResult, setLatestSamplingResult] = useState<SparseSamplingResult | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const samplingCanvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const renderRafRef = useRef(0)
  const roiRef = useRef(roi)
  const currentStepRef = useRef<SparseSamplingStep>(currentStep)
  const roiDragRef = useRef<RoiDrag>({ active: false, handleIndex: -1 })
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameContextRef = useRef<CanvasRenderingContext2D | null>(null)
  const latestSamplingResultRef = useRef<SparseSamplingResult | null>(null)
  const latestCommitRef = useRef(0)
  const latestDetectionRef = useRef(0)
  const latestAuxRenderRef = useRef(0)
  const stableSeedRef = useRef<StableSeed | null>(null)

  useEffect(() => {
    currentStepRef.current = currentStep
  }, [currentStep])

  useEffect(() => {
    roiRef.current = roi
    stableSeedRef.current = null
  }, [roi])

  useEffect(() => {
    testEyeTrackerStorage.writePrefs({
      kind,
      source,
      roi,
      eyeCorners: savedPrefs.eyeCorners,
      parameters: savedPrefs.parameters,
    })
  }, [kind, roi, savedPrefs.eyeCorners, savedPrefs.parameters, source])

  useEffect(() => {
    return () => {
      closePreview()
    }
  }, [])

  function ensureVideoElement() {
    if (videoRef.current) return videoRef.current

    const video = document.createElement("video")
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.style.display = "none"
    if (typeof document !== "undefined" && document.body) {
      document.body.appendChild(video)
    }

    videoRef.current = video
    return video
  }

  function ensureFrameContext() {
    if (frameContextRef.current && frameCanvasRef.current) {
      return { canvas: frameCanvasRef.current, context: frameContextRef.current }
    }

    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) {
      throw new Error("Unable to initialize the sparse-sampling frame context.")
    }

    frameCanvasRef.current = canvas
    frameContextRef.current = context
    return { canvas, context }
  }

  async function openPreview() {
    try {
      closePreview()
      setPreviewError("")
      setLatestSamplingResult(null)
      latestSamplingResultRef.current = null
      latestDetectionRef.current = 0
      latestAuxRenderRef.current = 0
      stableSeedRef.current = null

      const video = ensureVideoElement()
      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        throw new Error("Camera APIs are not available in this environment")
      }

      if (kind === "usb") {
        const constraints = await usbConstraints({ kind: "usb", source })
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false })
        video.srcObject = streamRef.current
        await video.play().catch(() => undefined)
        await waitForVideo(video)
        refreshExposureState()
      } else {
        video.srcObject = null
        video.crossOrigin = "anonymous"
        video.src = source
        await waitForVideo(video)
        await video.play().catch(() => undefined)
        setExposureState({
          ...DEFAULT_EXPOSURE_STATE,
          error: "Exposure controls are only available for browser-managed USB cameras.",
        })
      }

      setPreviewActive(true)
      startRenderLoop()
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Failed to start preview")
      closePreview()
    }
  }

  function closePreview() {
    cancelAnimationFrame(renderRafRef.current)
    renderRafRef.current = 0

    const video = videoRef.current
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }

    if (video?.srcObject) video.srcObject = null
    if (video?.src) {
      video.removeAttribute("src")
      video.load()
    }

    setPreviewActive(false)
    setExposureState(DEFAULT_EXPOSURE_STATE)
  }

  function getActiveVideoTrack(): MediaStreamTrack | null {
    return streamRef.current?.getVideoTracks()[0] ?? null
  }

  function readExposureState(track: MediaStreamTrack): CameraExposureState {
    const capabilities = readTrackCapabilities(track)
    const settings = readTrackSettings(track)
    const modes = Array.isArray(capabilities.exposureMode) ? capabilities.exposureMode : []
    const exposureTimeRange = normalizeNumericCapability(capabilities.exposureTime)
    const supported = modes.length > 0 || Boolean(exposureTimeRange)
    const autoSupported = modes.includes("continuous") || modes.includes("single-shot")

    return {
      supported,
      modeSupported: modes.length > 0,
      manualSupported: modes.includes("manual"),
      autoSupported,
      exposureTimeSupported: Boolean(exposureTimeRange),
      modes,
      mode: typeof settings.exposureMode === "string" ? settings.exposureMode : "unknown",
      exposureTime: typeof settings.exposureTime === "number" ? settings.exposureTime : null,
      exposureTimeRange,
      iso: typeof settings.iso === "number" ? settings.iso : null,
      exposureCompensation: typeof settings.exposureCompensation === "number" ? settings.exposureCompensation : null,
      error: supported ? "" : "This camera/browser does not expose exposure controls.",
    }
  }

  function refreshExposureState() {
    const track = getActiveVideoTrack()
    if (!track) {
      setExposureState(DEFAULT_EXPOSURE_STATE)
      return
    }

    try {
      setExposureState(readExposureState(track))
    } catch (error) {
      setExposureState({
        ...DEFAULT_EXPOSURE_STATE,
        error: error instanceof Error ? error.message : "Unable to read camera exposure settings.",
      })
    }
  }

  async function applyExposureConstraints(constraints: Record<string, unknown>) {
    const track = getActiveVideoTrack()
    if (!track) {
      setExposureState({
        ...DEFAULT_EXPOSURE_STATE,
        error: "Start the USB camera preview before changing exposure.",
      })
      return
    }

    try {
      await track.applyConstraints({
        advanced: [constraints as MediaTrackConstraintSet],
      })
      refreshExposureState()
    } catch (error) {
      setExposureState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : "Unable to apply exposure setting.",
      }))
    }
  }

  async function setAutoExposure() {
    const mode = exposureState.modes.includes("continuous")
      ? "continuous"
      : exposureState.modes.includes("single-shot")
        ? "single-shot"
        : ""
    if (!mode) return
    await applyExposureConstraints({ exposureMode: mode })
  }

  async function lockManualExposure() {
    if (!exposureState.manualSupported) return
    const constraints: Record<string, unknown> = { exposureMode: "manual" }
    if (exposureState.exposureTimeSupported && typeof exposureState.exposureTime === "number") {
      constraints.exposureTime = exposureState.exposureTime
    }
    await applyExposureConstraints(constraints)
  }

  async function setManualExposureTime(value: number) {
    if (!exposureState.exposureTimeRange) return
    const step = exposureState.exposureTimeRange.step || 1
    const clamped = clamp(value, exposureState.exposureTimeRange.min, exposureState.exposureTimeRange.max)
    const stepped = Math.round(clamped / step) * step
    await applyExposureConstraints({
      exposureMode: exposureState.manualSupported ? "manual" : exposureState.mode,
      exposureTime: clamp(stepped, exposureState.exposureTimeRange.min, exposureState.exposureTimeRange.max),
    })
  }

  function ensureCanvasSize(video: HTMLVideoElement) {
    const canvas = canvasRef.current
    const samplingCanvas = samplingCanvasRef.current
    if (!canvas || video.videoWidth <= 1 || video.videoHeight <= 1) return

    if (canvas.width !== 640 || canvas.height !== 480) {
      canvas.width = 640
      canvas.height = 480
    }

    if (samplingCanvas && (samplingCanvas.width !== 640 || samplingCanvas.height !== 320)) {
      samplingCanvas.width = 640
      samplingCanvas.height = 320
    }
  }

  function commitSamplingResult(nextResult: SparseSamplingResult) {
    latestSamplingResultRef.current = nextResult
    const now = performance.now()
    if (now - latestCommitRef.current < 100) return
    latestCommitRef.current = now
    setLatestSamplingResult(nextResult)
  }

  function renderSparseSamplingCanvas(result: SparseSamplingResult | null) {
    const canvas = samplingCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#050a12"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!result || result.sampleColumns <= 0 || result.sampleRows <= 0) return

    const cellSize = Math.min(
      canvas.width / result.sampleColumns,
      canvas.height / result.sampleRows,
    )
    const gridWidth = result.sampleColumns * cellSize
    const gridHeight = result.sampleRows * cellSize
    const offsetX = (canvas.width - gridWidth) * 0.5
    const offsetY = (canvas.height - gridHeight) * 0.5

    for (const sample of result.samples) {
      const x = offsetX + sample.columnIndex * cellSize
      const y = offsetY + sample.rowIndex * cellSize
      const intensity = clamp(sample.average / 255, 0, 1)
      const hue = 60 * intensity

      ctx.fillStyle = `hsl(${hue}, 95%, 55%)`
      ctx.fillRect(x, y, cellSize, cellSize)
    }

    if (result.darkestSample) {
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 2
      ctx.strokeRect(
        offsetX + result.darkestSample.columnIndex * cellSize,
        offsetY + result.darkestSample.rowIndex * cellSize,
        cellSize,
        cellSize,
      )
    }

    const darkestGridX = offsetX + ((result.darkestPixel.local[0] + 0.5) / result.roi.width) * gridWidth
    const darkestGridY = offsetY + ((result.darkestPixel.local[1] + 0.5) / result.roi.height) * gridHeight
    ctx.beginPath()
    ctx.arc(darkestGridX, darkestGridY, Math.max(3, cellSize * 0.3), 0, Math.PI * 2)
    ctx.fillStyle = "#111827"
    ctx.fill()
    ctx.strokeStyle = "#f8fafc"
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  function renderPupilContourCanvas(result: SparseSamplingResult | null) {
    const canvas = samplingCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#050a12"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!result?.pupilContour) return

    const contour = result.pupilContour
    const scale = Math.min(canvas.width / contour.mask.width, canvas.height / contour.mask.height)
    const drawWidth = contour.mask.width * scale
    const drawHeight = contour.mask.height * scale
    const offsetX = (canvas.width - drawWidth) * 0.5
    const offsetY = (canvas.height - drawHeight) * 0.5

    const imageData = ctx.createImageData(contour.mask.width, contour.mask.height)
    for (let i = 0; i < contour.mask.data.length; i += 1) {
      const on = contour.mask.data[i] > 0
      const p = i * 4
      imageData.data[p] = on ? 239 : 15
      imageData.data[p + 1] = on ? 68 : 23
      imageData.data[p + 2] = on ? 68 : 42
      imageData.data[p + 3] = 255
    }

    const offscreen = document.createElement("canvas")
    offscreen.width = contour.mask.width
    offscreen.height = contour.mask.height
    const offscreenCtx = offscreen.getContext("2d")
    if (!offscreenCtx) return
    offscreenCtx.putImageData(imageData, 0, 0)

    ctx.drawImage(offscreen, offsetX, offsetY, drawWidth, drawHeight)
    ctx.strokeStyle = "#facc15"
    ctx.lineWidth = 2
    ctx.strokeRect(
      offsetX + contour.boundingBox.x * scale,
      offsetY + contour.boundingBox.y * scale,
      contour.boundingBox.width * scale,
      contour.boundingBox.height * scale,
    )

    ctx.beginPath()
    ctx.arc(
      offsetX + contour.componentCenter[0] * scale,
      offsetY + contour.componentCenter[1] * scale,
      5,
      0,
      Math.PI * 2,
    )
    ctx.fillStyle = "#f8fafc"
    ctx.fill()
  }

  function drawSparseSamplingOverlay(
    ctx: CanvasRenderingContext2D,
    result: SparseSamplingResult,
    scaleX: number,
    scaleY: number,
  ) {
    drawRoiOverlay(ctx, result.roi, scaleX, scaleY, -1)

    for (const sample of result.samples) {
      const intensity = clamp(sample.average / 255, 0, 1)
      const hue = 60 * intensity
      const x = sample.globalOrigin[0] * scaleX
      const y = sample.globalOrigin[1] * scaleY
      const width = sample.size.width * scaleX
      const height = sample.size.height * scaleY

      ctx.fillStyle = `hsla(${hue}, 95%, 55%, 0.35)`
      ctx.fillRect(x, y, width, height)
    }

    if (result.darkestSample) {
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 1.5
      ctx.strokeRect(
        result.darkestSample.globalOrigin[0] * scaleX,
        result.darkestSample.globalOrigin[1] * scaleY,
        result.darkestSample.size.width * scaleX,
        result.darkestSample.size.height * scaleY,
      )
    }

    const targetX = result.darkestPixel.global[0] * scaleX
    const targetY = result.darkestPixel.global[1] * scaleY

    ctx.beginPath()
    ctx.arc(targetX, targetY, 7, 0, Math.PI * 2)
    ctx.strokeStyle = "#111827"
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(targetX - 10, targetY)
    ctx.lineTo(targetX + 10, targetY)
    ctx.moveTo(targetX, targetY - 10)
    ctx.lineTo(targetX, targetY + 10)
    ctx.strokeStyle = "#ef4444"
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  function drawPupilContourOverlay(
    ctx: CanvasRenderingContext2D,
    result: SparseSamplingResult,
    scaleX: number,
    scaleY: number,
  ) {
    drawRoiOverlay(ctx, result.roi, scaleX, scaleY, -1)
    if (!result.pupilContour) return

    const contour = result.pupilContour
    ctx.strokeStyle = "#facc15"
    ctx.lineWidth = 2
    ctx.strokeRect(
      contour.globalBoundingBox.x * scaleX,
      contour.globalBoundingBox.y * scaleY,
      contour.globalBoundingBox.width * scaleX,
      contour.globalBoundingBox.height * scaleY,
    )

    ctx.beginPath()
    ctx.arc(contour.globalCenter[0] * scaleX, contour.globalCenter[1] * scaleY, 7, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(250, 204, 21, 0.9)"
    ctx.fill()
    ctx.strokeStyle = "#111827"
    ctx.lineWidth = 2
    ctx.stroke()
  }

  function buildSparseSamplingResult(video: HTMLVideoElement): SparseSamplingResult | null {
    const width = video.videoWidth
    const height = video.videoHeight
    if (width <= 1 || height <= 1) return null

    const { canvas, context } = ensureFrameContext()
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    context.drawImage(video, 0, 0, width, height)
    const normalizedRoi = normalizeRoi(roiRef.current, width, height)
    const frame = context.getImageData(
      normalizedRoi.x,
      normalizedRoi.y,
      normalizedRoi.width,
      normalizedRoi.height,
    )
    const rawGray = toSparseSamplingIntensity(frame.data)
    const smoothedGray = rawGray

    const result = computeSparseSampling(rawGray, smoothedGray, normalizedRoi)
    if (currentStepRef.current !== "pupil" && !stableSeedRef.current) {
      return result
    }
    return stabilizeSamplingResult(result, rawGray, smoothedGray, stableSeedRef)
  }

  function render(time = performance.now()) {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!video || !canvas || !ctx || video.videoWidth <= 1 || video.videoHeight <= 1) return

    ensureCanvasSize(video)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height)

    const scaleX = canvas.width / video.videoWidth
    const scaleY = canvas.height / video.videoHeight
    const step = currentStepRef.current
    const detectionInterval = step === "pupil" ? PUPIL_DETECTION_INTERVAL_MS : DETECTION_INTERVAL_MS

    if (step === "roi") {
      drawRoiOverlay(ctx, roiRef.current, scaleX, scaleY, roiDragRef.current.handleIndex)
    }

    let samplingResult = latestSamplingResultRef.current
    if (time - latestDetectionRef.current >= detectionInterval) {
      latestDetectionRef.current = time
      samplingResult = buildSparseSamplingResult(video)
      if (samplingResult) {
        commitSamplingResult(samplingResult)
      }
    }

    if (samplingResult) {
      if (time - latestAuxRenderRef.current >= detectionInterval) {
        latestAuxRenderRef.current = time
        if (step === "pupil") {
          renderPupilContourCanvas(samplingResult)
        } else if (step === "sampling") {
          renderSparseSamplingCanvas(samplingResult)
        }
      }

      if (step === "sampling") {
        drawSparseSamplingOverlay(ctx, samplingResult, scaleX, scaleY)
      }

      if (step === "pupil") {
        drawPupilContourOverlay(ctx, samplingResult, scaleX, scaleY)
      }
    } else if (step === "sampling" || step === "pupil") {
      renderSparseSamplingCanvas(null)
    }
  }

  function startRenderLoop() {
    cancelAnimationFrame(renderRafRef.current)
    const tick = (time: number) => {
      render(time)
      renderRafRef.current = requestAnimationFrame(tick)
    }
    renderRafRef.current = requestAnimationFrame(tick)
  }

  function pushUpdate() {
    if (!previewActive) return
    render()
  }

  function goToStep(step: SparseSamplingStep) {
    setCurrentStep(step)
  }

  function getCanvasPoint(event: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const video = videoRef.current
    const width = video?.videoWidth ?? canvas.width
    const height = video?.videoHeight ?? canvas.height

    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    }
  }

  function hitTestHandle(point: { x: number; y: number }) {
    const current = roiRef.current
    const corners: [number, number][] = [
      [current.x, current.y],
      [current.x + current.width, current.y],
      [current.x, current.y + current.height],
      [current.x + current.width, current.y + current.height],
    ]

    return corners.findIndex(([cx, cy]) => Math.hypot(point.x - cx, point.y - cy) <= 14)
  }

  function onCanvasMouseDown(event: ReactMouseEvent<HTMLCanvasElement>) {
    if (currentStep !== "roi") return
    const point = getCanvasPoint(event)
    const handleIndex = hitTestHandle(point)
    if (handleIndex >= 0) {
      roiDragRef.current = { active: true, handleIndex }
    }
  }

  function onCanvasMouseMove(event: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas || currentStep !== "roi") return

    const point = getCanvasPoint(event)
    if (!roiDragRef.current.active) {
      const handleIndex = hitTestHandle(point)
      roiDragRef.current.handleIndex = handleIndex
      canvas.style.cursor = handleIndex >= 0 ? "crosshair" : "default"
      return
    }

    const { handleIndex } = roiDragRef.current
    const video = videoRef.current
    const maxWidth = video?.videoWidth ?? 640
    const maxHeight = video?.videoHeight ?? 480

    setRoi((previousRoi) => {
      let { x, y, width, height } = previousRoi

      if (handleIndex === 0) {
        const nextX = clamp(point.x, 0, x + width - 10)
        const nextY = clamp(point.y, 0, y + height - 10)
        width += x - nextX
        height += y - nextY
        x = nextX
        y = nextY
      } else if (handleIndex === 1) {
        width = clamp(point.x - x, 10, maxWidth - x)
        const nextY = clamp(point.y, 0, y + height - 10)
        height += y - nextY
        y = nextY
      } else if (handleIndex === 2) {
        const nextX = clamp(point.x, 0, x + width - 10)
        width += x - nextX
        x = nextX
        height = clamp(point.y - y, 10, maxHeight - y)
      } else if (handleIndex === 3) {
        width = clamp(point.x - x, 10, maxWidth - x)
        height = clamp(point.y - y, 10, maxHeight - y)
      }

      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      }
    })
  }

  function onCanvasMouseUp() {
    if (!roiDragRef.current.active) return
    roiDragRef.current.active = false
    pushUpdate()
  }

  const stepIndex = STEPS.indexOf(currentStep)

  return {
    currentStep,
    stepIndex,
    steps: STEPS,
    kind,
    setKind,
    source,
    setSource,
    roi,
    setRoi,
    previewActive,
    previewError,
    exposureState,
    latestSamplingResult,
    canvasRef,
    samplingCanvasRef,
    openPreview,
    closePreview,
    refreshExposureState,
    setAutoExposure,
    lockManualExposure,
    setManualExposureTime,
    pushUpdate,
    goToStep,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
  }
}

function computeSparseSampling(rawGray: Uint8Array, smoothedGray: Uint8Array, roi: RoiRect): SparseSamplingResult {
  const blockSize = SPARSE_BLOCK_SIZE
  const edgeMargin = Math.max(16, Math.round(Math.min(roi.width, roi.height) * 0.14))
  const topEdgeMargin = Math.max(24, Math.round(roi.height * 0.2))

  const samples: SparseSamplingPoint[] = []

  const sampleColumns = Math.max(1, Math.ceil(roi.width / blockSize))
  const sampleRows = Math.max(1, Math.ceil(roi.height / blockSize))

  for (let rowIndex = 0; rowIndex < sampleRows; rowIndex += 1) {
    const minY = rowIndex * blockSize
    const maxY = Math.min(roi.height, minY + blockSize)

    for (let columnIndex = 0; columnIndex < sampleColumns; columnIndex += 1) {
      const minX = columnIndex * blockSize
      const maxX = Math.min(roi.width, minX + blockSize)
      let sum = 0
      let count = 0
      let smoothedSum = 0
      let darkestBlockValue = 255
      let darkestBlockLocalX = minX
      let darkestBlockLocalY = minY
      for (let sampleY = minY; sampleY < maxY; sampleY += 1) {
        for (let sampleX = minX; sampleX < maxX; sampleX += 1) {
          const rawValue = rawGray[sampleY * roi.width + sampleX] ?? 255
          const smoothedValue = smoothedGray[sampleY * roi.width + sampleX] ?? rawValue
          sum += rawValue
          smoothedSum += smoothedValue
          count += 1
          if (rawValue < darkestBlockValue) {
            darkestBlockValue = rawValue
            darkestBlockLocalX = sampleX
            darkestBlockLocalY = sampleY
          }
        }
      }

      const centerX = Math.floor((minX + maxX - 1) * 0.5)
      const centerY = Math.floor((minY + maxY - 1) * 0.5)
      const average = count > 0 ? smoothedSum / count : 255
      const edgePenalty = computeEdgePenalty(centerX, centerY, roi.width, roi.height, edgeMargin, topEdgeMargin)
      const selectionScore = average + edgePenalty

      const sample: SparseSamplingPoint = {
        rowIndex,
        columnIndex,
        localOrigin: [minX, minY],
        globalOrigin: [roi.x + minX, roi.y + minY],
        size: {
          width: maxX - minX,
          height: maxY - minY,
        },
        localCenter: [centerX, centerY],
        globalCenter: [roi.x + centerX, roi.y + centerY],
        average,
        darkestPixel: {
          local: [darkestBlockLocalX, darkestBlockLocalY],
          global: [roi.x + darkestBlockLocalX, roi.y + darkestBlockLocalY],
          value: darkestBlockValue,
        },
        darkSupport: 0,
        confidence: 0,
        selectionScore,
      }

      samples.push(sample)
    }
  }

  let darkestSample = selectDarkestStableSample(samples, sampleColumns)
  if (samples.length === 0) {
    const fallback = buildFallbackSample(rawGray, roi)
    samples.push(fallback)
    darkestSample = fallback
  }

  const darkestPixel = darkestSample?.darkestPixel ?? {
    local: [0, 0] as [number, number],
    global: [roi.x, roi.y] as [number, number],
    value: 255,
  }

  return {
    roi,
    sampleColumns,
    sampleRows,
    samples,
    darkestSample,
    darkestPixel,
    seedConfidence: darkestSample?.confidence ?? 0,
    lockedToPrevious: false,
    trackingStatus: "estimated",
    pupilContour: null,
  }
}

function stabilizeSamplingResult(
  result: SparseSamplingResult,
  rawGray: Uint8Array,
  smoothedGray: Uint8Array,
  stableSeedRef: MutableRefObject<StableSeed | null>,
): SparseSamplingResult {
  const previous = isCompatibleRoi(stableSeedRef.current?.roi ?? null, result.roi)
    ? stableSeedRef.current
    : null
  const candidate = selectBestPupilCandidate(rawGray, smoothedGray, result, previous)
  if (!candidate) return result

  const previousPoint = previous?.pupilContour?.componentCenter ?? previous?.localCenter ?? null
  const targetPoint = candidate.contour?.componentCenter ?? candidate.sample.localCenter
  const alpha = candidate.contour
    ? clamp(0.28 + candidate.contour.confidence * 0.42, 0.28, 0.7)
    : clamp(0.18 + candidate.sample.confidence * 0.22, 0.18, 0.4)
  const trackedCenter = previousPoint
    ? smoothPoint(previousPoint, targetPoint, alpha, result.roi)
    : targetPoint
  const nearest = findNearestSample(result.samples, trackedCenter) ?? candidate.sample
  const trackedPixel = findDarkestPixelNear(rawGray, result.roi, trackedCenter, Math.max(4, SPARSE_BLOCK_SIZE * 2))
  const trackedSample: SparseSamplingPoint = {
    ...nearest,
    localCenter: trackedCenter,
    globalCenter: [result.roi.x + trackedCenter[0], result.roi.y + trackedCenter[1]],
    darkestPixel: trackedPixel,
    confidence: candidate.confidence,
  }
  const contour = candidate.contour
    ? remapPupilContourToTrackedCenter(candidate.contour, result.roi, trackedCenter)
    : null

  stableSeedRef.current = {
    localCenter: trackedCenter,
    darkestPixel: trackedPixel,
    roi: result.roi,
    confidence: candidate.confidence,
    pupilContour: contour,
  }

  return {
    ...result,
    darkestSample: trackedSample,
    darkestPixel: trackedPixel,
    seedConfidence: candidate.confidence,
    lockedToPrevious: false,
    trackingStatus: contour && contour.confidence >= MIN_PUPIL_CONTOUR_CONFIDENCE ? "contour" : "estimated",
    pupilContour: contour,
  }
}

function isCompatibleRoi(previous: RoiRect | null, next: RoiRect): boolean {
  if (!previous) return false
  return (
    Math.abs(previous.width - next.width) <= 2
    && Math.abs(previous.height - next.height) <= 2
  )
}

function remapPupilContourToRoi(contour: PupilContourResult, roi: RoiRect): PupilContourResult {
  return {
    ...contour,
    globalCenter: [roi.x + contour.componentCenter[0], roi.y + contour.componentCenter[1]],
    globalBoundingBox: {
      x: roi.x + contour.boundingBox.x,
      y: roi.y + contour.boundingBox.y,
      width: contour.boundingBox.width,
      height: contour.boundingBox.height,
    },
  }
}

function remapPupilContourToTrackedCenter(
  contour: PupilContourResult,
  roi: RoiRect,
  center: [number, number],
): PupilContourResult {
  const dx = center[0] - contour.componentCenter[0]
  const dy = center[1] - contour.componentCenter[1]
  const componentCenter: [number, number] = center
  const boundingBox = {
    x: clamp(Math.round(contour.boundingBox.x + dx), 0, Math.max(0, roi.width - contour.boundingBox.width)),
    y: clamp(Math.round(contour.boundingBox.y + dy), 0, Math.max(0, roi.height - contour.boundingBox.height)),
    width: contour.boundingBox.width,
    height: contour.boundingBox.height,
  }

  return {
    ...contour,
    componentCenter,
    globalCenter: [roi.x + componentCenter[0], roi.y + componentCenter[1]],
    boundingBox,
    globalBoundingBox: {
      x: roi.x + boundingBox.x,
      y: roi.y + boundingBox.y,
      width: boundingBox.width,
      height: boundingBox.height,
    },
  }
}

function selectBestPupilCandidate(
  rawGray: Uint8Array,
  smoothedGray: Uint8Array,
  result: SparseSamplingResult,
  previous: StableSeed | null,
): PupilCandidate | null {
  if (result.samples.length === 0) return null

  const sparseCandidates = selectPupilCandidateSeeds(result, previous)
  let best: PupilCandidate | null = null

  for (const sample of sparseCandidates) {
    const contour = findPupilContourByBinarySearch(
      rawGray,
      smoothedGray,
      result.roi,
      sample,
      sample.darkestPixel,
      false,
      FAST_CONTOUR_SEARCH,
    )
    const score = computePupilCandidateScore(sample, contour, result.roi, previous)
    const confidence = clamp(
      sample.confidence * 0.34
      + (contour?.confidence ?? 0) * 0.5
      + clamp(1 - score / 2.2, 0, 1) * 0.16,
      0,
      1,
    )
    const candidate: PupilCandidate = { sample, contour, score, confidence }
    if (!best || candidate.score < best.score) best = candidate
  }

  return best
}

function selectPupilCandidateSeeds(
  result: SparseSamplingResult,
  previous: StableSeed | null,
): SparseSamplingPoint[] {
  const sorted = [...result.samples].sort((a, b) => a.selectionScore - b.selectionScore)
  const seeds: SparseSamplingPoint[] = []
  const maxSeeds = previous ? 4 : 5
  const previousPoint = previous?.pupilContour?.componentCenter ?? previous?.localCenter ?? null

  if (previousPoint) {
    pushUniqueSample(seeds, findNearestSample(result.samples, previousPoint))

    const localityRadius = Math.max(18, Math.min(result.roi.width, result.roi.height) * 0.24)
    for (const sample of sorted) {
      if (seeds.length >= 3) break

      const distance = Math.hypot(sample.localCenter[0] - previousPoint[0], sample.localCenter[1] - previousPoint[1])
      if (distance <= localityRadius) {
        pushUniqueSample(seeds, sample)
      }
    }
  }

  pushUniqueSample(seeds, result.darkestSample)

  for (const sample of sorted) {
    if (seeds.length >= maxSeeds) break
    pushUniqueSample(seeds, sample)
  }

  return seeds
}

function pushUniqueSample(
  samples: SparseSamplingPoint[],
  sample: SparseSamplingPoint | null,
) {
  if (!sample) return
  const exists = samples.some((item) => item.rowIndex === sample.rowIndex && item.columnIndex === sample.columnIndex)
  if (!exists) samples.push(sample)
}

function computePupilCandidateScore(
  sample: SparseSamplingPoint,
  contour: PupilContourResult | null,
  roi: RoiRect,
  previous: StableSeed | null,
): number {
  const contourPenalty = contour ? 1 - contour.confidence : 0.72
  const seedPenalty = 1 - sample.confidence
  const target = contour?.componentCenter ?? sample.localCenter
  const previousPoint = previous?.pupilContour?.componentCenter ?? previous?.localCenter ?? null
  const motionPenalty = previousPoint
    ? Math.min(1.5, Math.hypot(target[0] - previousPoint[0], target[1] - previousPoint[1]) / Math.max(1, Math.min(roi.width, roi.height) * 0.34))
    : 0
  const edgePenalty = computeEdgePenalty(target[0], target[1], roi.width, roi.height, Math.max(12, Math.round(Math.min(roi.width, roi.height) * 0.12)), Math.max(18, Math.round(roi.height * 0.16))) / 50

  return contourPenalty * 0.52 + seedPenalty * 0.2 + motionPenalty * 0.22 + edgePenalty * 0.06
}

function smoothPoint(
  previous: [number, number],
  next: [number, number],
  alpha: number,
  roi: RoiRect,
): [number, number] {
  return [
    clamp(Math.round(previous[0] + (next[0] - previous[0]) * alpha), 0, roi.width - 1),
    clamp(Math.round(previous[1] + (next[1] - previous[1]) * alpha), 0, roi.height - 1),
  ]
}

function findDarkestPixelNear(
  rawGray: Uint8Array,
  roi: RoiRect,
  center: [number, number],
  radius: number,
): SparseSamplingResult["darkestPixel"] {
  let bestValue = 255
  let bestX = center[0]
  let bestY = center[1]
  const x0 = clamp(center[0] - radius, 0, roi.width - 1)
  const x1 = clamp(center[0] + radius, 0, roi.width - 1)
  const y0 = clamp(center[1] - radius, 0, roi.height - 1)
  const y1 = clamp(center[1] + radius, 0, roi.height - 1)

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const value = rawGray[y * roi.width + x] ?? 255
      if (value < bestValue) {
        bestValue = value
        bestX = x
        bestY = y
      }
    }
  }

  return {
    local: [bestX, bestY],
    global: [roi.x + bestX, roi.y + bestY],
    value: bestValue,
  }
}

function findNearestSample(
  samples: SparseSamplingPoint[],
  point: [number, number],
): SparseSamplingPoint | null {
  let nearest: SparseSamplingPoint | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const sample of samples) {
    const distance = Math.hypot(sample.localCenter[0] - point[0], sample.localCenter[1] - point[1])
    if (distance < nearestDistance) {
      nearest = sample
      nearestDistance = distance
    }
  }

  return nearest
}

function selectDarkestStableSample(
  samples: SparseSamplingPoint[],
  sampleColumns: number,
): SparseSamplingPoint | null {
  if (samples.length === 0) return null

  const minAverage = Math.min(...samples.map((sample) => sample.average))
  let best: SparseSamplingPoint | null = null
  let bestScore = Number.POSITIVE_INFINITY
  let bestSupport = 0

  for (const sample of samples) {
    const support = computeDarkNeighborhoodSupport(sample, samples, sampleColumns, minAverage)
    const confidence = computeSeedConfidence(sample, support, minAverage)
    const supportBonus = Math.min(62, support * 7.5)
    const score = sample.selectionScore - supportBonus
    sample.darkSupport = support
    sample.confidence = confidence
    sample.selectionScore = score

    if (
      !best
      || score < bestScore
      || (
        score === bestScore
        && support > bestSupport
      )
      || (
        score === bestScore
        && sample.average < best.average
      )
    ) {
      best = sample
      bestScore = score
      bestSupport = support
    }
  }

  return best
}

function computeDarkNeighborhoodSupport(
  sample: SparseSamplingPoint,
  samples: SparseSamplingPoint[],
  sampleColumns: number,
  minAverage: number,
): number {
  let support = 0
  const radius = 2
  const darkWindow = 48

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const row = sample.rowIndex + dy
      const column = sample.columnIndex + dx
      if (row < 0 || column < 0 || column >= sampleColumns) continue

      const neighbor = samples[row * sampleColumns + column]
      if (!neighbor) continue
      if (neighbor.average > minAverage + darkWindow) continue

      const distance = Math.max(1, Math.hypot(dx, dy))
      const similarity = Math.max(0, 1 - Math.abs(neighbor.average - sample.average) / darkWindow)
      support += similarity / distance
    }
  }

  return support
}

function computeSeedConfidence(
  sample: SparseSamplingPoint,
  support: number,
  minAverage: number,
): number {
  const supportConfidence = clamp((support - 3.2) / 6.8, 0, 1)
  const darknessConfidence = clamp(1 - (sample.average - minAverage) / 62, 0, 1)
  const absoluteDarknessConfidence = clamp(1 - sample.average / 190, 0, 1)
  return clamp(
    supportConfidence * 0.62
    + darknessConfidence * 0.24
    + absoluteDarknessConfidence * 0.14,
    0,
    1,
  )
}

function buildFallbackSample(gray: Uint8Array, roi: RoiRect): SparseSamplingPoint {
  const centerX = Math.max(0, Math.floor(roi.width * 0.5))
  const centerY = Math.max(0, Math.floor(roi.height * 0.5))
  const value = gray[Math.min(gray.length - 1, centerY * roi.width + centerX)] ?? 255

  return {
    rowIndex: 0,
    columnIndex: 0,
    localOrigin: [0, 0],
    globalOrigin: [roi.x, roi.y],
    size: {
      width: Math.max(1, roi.width),
      height: Math.max(1, roi.height),
    },
    localCenter: [centerX, centerY],
    globalCenter: [roi.x + centerX, roi.y + centerY],
    average: value,
    darkestPixel: {
      local: [centerX, centerY],
      global: [roi.x + centerX, roi.y + centerY],
      value,
    },
    darkSupport: 0,
    confidence: 0,
    selectionScore: value,
  }
}

function findPupilContourByBinarySearch(
  rawGray: Uint8Array,
  smoothedGray: Uint8Array,
  roi: RoiRect,
  seedSample: SparseSamplingPoint,
  darkestPixel: SparseSamplingResult["darkestPixel"],
  requireMinimumConfidence = true,
  searchOptions: ContourSearchOptions = FULL_CONTOUR_SEARCH,
): PupilContourResult | null {
  const roiArea = roi.width * roi.height
  const targetArea = clamp(Math.round(roiArea * 0.026), 80, Math.min(2400, Math.round(roiArea * 0.16)))
  const minArea = Math.max(30, Math.round(targetArea * 0.35))
  const maxArea = Math.max(minArea + 1, Math.round(targetArea * 2.8))
  const seed = seedSample.localCenter
  let low = clamp(darkestPixel.value + 4, 0, 255)
  let high = clamp(darkestPixel.value + 95, low, 255)
  let best: ThresholdCandidate | null = null

  for (let i = 0; i < searchOptions.iterations && low <= high; i += 1) {
    const threshold = Math.floor((low + high) * 0.5)
    const candidate = buildThresholdCandidate(smoothedGray, rawGray, roi, threshold, seed, targetArea, minArea, maxArea)

    if (!candidate || candidate.area < targetArea) {
      low = threshold + 1
      continue
    }

    best = chooseBetterCandidate(best, candidate)
    high = threshold - 1
  }

  const baseThreshold = best?.threshold ?? clamp(darkestPixel.value + 45, 0, 255)
  const refineStart = Math.max(0, baseThreshold - searchOptions.refineRadius)
  const refineEnd = Math.min(255, baseThreshold + searchOptions.refineRadius)
  for (let threshold = refineStart; threshold <= refineEnd; threshold += searchOptions.refineStep) {
    const candidate = buildThresholdCandidate(smoothedGray, rawGray, roi, threshold, seed, targetArea, minArea, maxArea)
    best = chooseBetterCandidate(best, candidate)
  }

  if (!best || (requireMinimumConfidence && best.confidence < MIN_PUPIL_CONTOUR_CONFIDENCE)) return null

  return {
    threshold: best.threshold,
    pupilPixelCount: best.area,
    contourPointCount: best.contourPointCount,
    componentCenter: best.center,
    globalCenter: [roi.x + best.center[0], roi.y + best.center[1]],
    boundingBox: best.bbox,
    globalBoundingBox: {
      x: roi.x + best.bbox.x,
      y: roi.y + best.bbox.y,
      width: best.bbox.width,
      height: best.bbox.height,
    },
    confidence: best.confidence,
    mask: {
      width: roi.width,
      height: roi.height,
      data: best.componentMask,
    },
  }
}

function buildThresholdCandidate(
  smoothedGray: Uint8Array,
  rawGray: Uint8Array,
  roi: RoiRect,
  threshold: number,
  seed: [number, number],
  targetArea: number,
  minArea: number,
  maxArea: number,
): ThresholdCandidate | null {
  const thresholdMask = new Uint8Array(smoothedGray.length)
  for (let i = 0; i < smoothedGray.length; i += 1) {
    thresholdMask[i] = smoothedGray[i] <= threshold ? 255 : 0
  }

  const blobs = components(thresholdMask, roi.width, roi.height)
  let best: ThresholdCandidate | null = null
  for (const blob of blobs) {
    if (blob.area < minArea || blob.area > maxArea) continue
    if (blob.points.length < 10) continue

    const aspect = Math.max(blob.bbox.width / Math.max(1, blob.bbox.height), blob.bbox.height / Math.max(1, blob.bbox.width))
    if (aspect > 2.7) continue

    const center: [number, number] = [
      Math.round(blob.sumX / blob.area),
      Math.round(blob.sumY / blob.area),
    ]
    const seedDistance = Math.hypot(center[0] - seed[0], center[1] - seed[1])
    const distanceScore = seedDistance / Math.max(1, Math.min(roi.width, roi.height) * 0.38)
    const areaScore = Math.abs(blob.area - targetArea) / Math.max(1, targetArea)
    const aspectScore = Math.max(0, aspect - 1.25) * 0.35
    const edgeScore = contourEdgePenalty(blob.bbox, roi.width, roi.height)
    const contourPointCount = countBoundaryPoints(blob, thresholdMask, roi.width, roi.height)
    const componentMask = componentToMask(blob, roi.width, roi.height)
    const darknessScore = componentMeanIntensity(blob, rawGray, roi.width) / 255
    const score = areaScore * 0.42 + distanceScore * 0.28 + aspectScore + edgeScore + darknessScore * 0.18
    const confidence = clamp(1 - score, 0, 1)

    best = chooseBetterCandidate(best, {
      threshold,
      area: blob.area,
      contourPointCount,
      center,
      bbox: blob.bbox,
      componentMask,
      score,
      confidence,
    })
  }

  return best
}

function chooseBetterCandidate(
  current: ThresholdCandidate | null,
  next: ThresholdCandidate | null,
): ThresholdCandidate | null {
  if (!next) return current
  if (!current) return next
  return next.score < current.score ? next : current
}

function componentToMask(
  component: ReturnType<typeof components>[number],
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < component.points.length; i += 2) {
    mask[component.points[i + 1] * width + component.points[i]] = 255
  }
  return mask
}

function countBoundaryPoints(
  component: ReturnType<typeof components>[number],
  mask: Uint8Array,
  width: number,
  height: number,
): number {
  let count = 0
  for (let i = 0; i < component.points.length; i += 2) {
    const x = component.points[i]
    const y = component.points[i + 1]
    if (
      x <= 0
      || y <= 0
      || x >= width - 1
      || y >= height - 1
      || mask[(y - 1) * width + x] === 0
      || mask[(y + 1) * width + x] === 0
      || mask[y * width + x - 1] === 0
      || mask[y * width + x + 1] === 0
    ) {
      count += 1
    }
  }
  return count
}

function componentMeanIntensity(
  component: ReturnType<typeof components>[number],
  gray: Uint8Array,
  width: number,
): number {
  if (component.area <= 0) return 255
  let sum = 0
  for (let i = 0; i < component.points.length; i += 2) {
    sum += gray[component.points[i + 1] * width + component.points[i]] ?? 255
  }
  return sum / component.area
}

function contourEdgePenalty(bbox: RoiRect, width: number, height: number): number {
  const touchesTop = bbox.y <= 1
  const touchesSide = bbox.x <= 1 || bbox.x + bbox.width >= width - 1
  const touchesBottom = bbox.y + bbox.height >= height - 1
  return (touchesTop ? 0.38 : 0) + (touchesSide ? 0.18 : 0) + (touchesBottom ? 0.12 : 0)
}

export type SparseSamplingSetupState = ReturnType<typeof useSparseSamplingSetupWidget>

function toSparseSamplingIntensity(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    out[j] = Math.round((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3)
  }
  return out
}

function computeEdgePenalty(
  x: number,
  y: number,
  width: number,
  height: number,
  edgeMargin: number,
  topEdgeMargin: number,
): number {
  const distanceToSide = Math.min(x, width - 1 - x)
  const distanceToBottom = height - 1 - y
  const topPenalty = scaledPenalty(y, topEdgeMargin, 34)
  const sidePenalty = scaledPenalty(distanceToSide, edgeMargin, 18)
  const bottomPenalty = scaledPenalty(distanceToBottom, edgeMargin, 10)
  return topPenalty + sidePenalty + bottomPenalty
}

function scaledPenalty(distance: number, margin: number, maxPenalty: number): number {
  if (distance >= margin) return 0
  const ratio = 1 - distance / Math.max(1, margin)
  return ratio * maxPenalty
}

function readTrackCapabilities(track: MediaStreamTrack): Record<string, unknown> {
  if (typeof track.getCapabilities !== "function") return {}
  return track.getCapabilities() as Record<string, unknown>
}

function readTrackSettings(track: MediaStreamTrack): Record<string, unknown> {
  if (typeof track.getSettings !== "function") return {}
  return track.getSettings() as Record<string, unknown>
}

function normalizeNumericCapability(value: unknown): NumericCapability | null {
  if (!value || typeof value !== "object") return null
  const range = value as Record<string, unknown>
  if (typeof range.min !== "number" || typeof range.max !== "number") return null
  return {
    min: range.min,
    max: range.max,
    step: typeof range.step === "number" && range.step > 0 ? range.step : undefined,
  }
}
