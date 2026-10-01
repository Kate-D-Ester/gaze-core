import { loadOpenCv } from "../eye-tracking/opencv"
import { createLandmarker } from "./face-landmarker"
import { buildIrFeatures } from "./ir-features"
import { IrEyeTracker } from "./ir-eye-tracker"
import {
  buildIrFaceFeatures,
  irEyeRegions,
  irEyeAperture,
  IR_EYE_CORNERS,
} from "./ir-face-features"
import { inspectRgbFace, type RgbFaceResult } from "./rgb-features"
import type { Ellipse } from "../eye-tracking/eye-tracking.types"
import type { Point, Rect, RemoteObservation, RemoteProcessor } from "./types"

export interface IrFaceLocator {
  detect(frame: ImageBitmap, timestamp: number): RgbFaceResult
  dispose(): void
}
async function loadFaceLocator(): Promise<IrFaceLocator> {
  const { landmarker, canvas } = await createLandmarker({
    outputFaceBlendshapes: false,
  })
  return {
    detect: (frame, timestamp) => landmarker.detectForVideo(frame, timestamp),
    dispose() {
      landmarker.close()
      canvas
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext()
      canvas.width = canvas.height = 0
    },
  }
}
const maxProcessingDimension = 640
function pixelRoi(roi: Rect, width: number, height: number): Rect | null {
  if (
    ![roi.x, roi.y, roi.width, roi.height, width, height].every(
      Number.isFinite
    ) ||
    roi.width <= 0 ||
    roi.height <= 0 ||
    width <= 0 ||
    height <= 0
  )
    return null
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const x = Math.floor(clamp(roi.x) * width),
    y = Math.floor(clamp(roi.y) * height)
  const right = Math.ceil(clamp(roi.x + roi.width) * width),
    bottom = Math.ceil(clamp(roi.y + roi.height) * height)
  return right - x >= 24 && bottom - y >= 24
    ? { x, y, width: right - x, height: bottom - y }
    : null
}
function automaticRegion(roi: Rect) {
  return roi.x === 0 && roi.y === 0 && roi.width === 1 && roi.height === 1
}

/** Only eye crops are resized; the original camera frame supplies all pupil pixels. */
export async function createIrProcessor(
  options: { faceLocator?: IrFaceLocator | null } = {}
): Promise<RemoteProcessor> {
  if (typeof OffscreenCanvas === "undefined")
    throw new Error(
      "IR processing requires worker canvas support in this browser"
    )
  const { cv } = await loadOpenCv()
  let locator: IrFaceLocator | null = options.faceLocator ?? null
  if (options.faceLocator === undefined) {
    try {
      locator = await loadFaceLocator()
    } catch {
      /* Close-up pupil/reflection tracking can still run without face inference. */
    }
  }
  const canvas = new OffscreenCanvas(1, 1),
    context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    locator?.dispose()
    throw new Error("The IR worker could not create its image canvas")
  }
  const closeup = new IrEyeTracker(cv)
  const eyeTrackers = [new IrEyeTracker(cv), new IrEyeTracker(cv)]
  const resetTracking = () => {
    closeup.reset()
    eyeTrackers.forEach((eye) => eye.reset())
  }
  let regionKey = "",
    disposed = false,
    lastTimestamp = -Infinity
  let pipeline: "face" | "closeup" | null = null
  function measure(
    frame: ImageBitmap,
    roi: Rect,
    timestamp: number,
    threshold: number,
    tracker: IrEyeTracker,
    eyeFrame?: { center: Point; span: number; angle: number; aperture: Point[] }
  ) {
    const scale = Math.min(
      1,
      maxProcessingDimension / Math.max(roi.width, roi.height)
    )
    const width = Math.round(roi.width * scale),
      height = Math.round(roi.height * scale)
    canvas.width = width
    canvas.height = height
    context!.drawImage(
      frame,
      roi.x,
      roi.y,
      roi.width,
      roi.height,
      0,
      0,
      width,
      height
    )
    const rgba = context!.getImageData(0, 0, width, height).data,
      gray = new Uint8Array(width * height)
    for (let i = 0; i < gray.length; i++)
      gray[i] = Math.round(
        0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
      )
    const eyeCoordinates = eyeFrame
      ? {
          origin: [
            (eyeFrame.center[0] - roi.x) * scale,
            (eyeFrame.center[1] - roi.y) * scale,
          ] as Point,
          scale: eyeFrame.span * scale,
          angle: eyeFrame.angle,
        }
      : undefined
    const detected = tracker.process(
      gray,
      width,
      height,
      threshold,
      timestamp,
      {
        maxRadius: eyeFrame ? eyeFrame.span * 0.22 * scale : undefined,
        centerRadius: eyeFrame ? eyeFrame.span * 0.42 * scale : undefined,
        expectedCenter: eyeCoordinates?.origin,
        centerRegion: eyeFrame?.aperture.map(([x, y]) => [
          (x - roi.x) * scale,
          (y - roi.y) * scale,
        ]),
      },
      eyeCoordinates
    )
    const scaleX = roi.width / width,
      scaleY = roi.height / height
    const pupil: Ellipse | null = detected.pupil
      ? {
          ...detected.pupil,
          center: [
            roi.x + detected.pupil.center[0] * scaleX,
            roi.y + detected.pupil.center[1] * scaleY,
          ],
          major: detected.pupil.major * Math.sqrt(scaleX * scaleY),
          minor: detected.pupil.minor * Math.sqrt(scaleX * scaleY),
        }
      : null
    const glint: Point | null = detected.glint
      ? [roi.x + detected.glint[0] * scaleX, roi.y + detected.glint[1] * scaleY]
      : null
    return { detected, pupil, glint }
  }
  return {
    async process(frame, timestamp, settings) {
      const started = performance.now(),
        roi = pixelRoi(settings.roi, frame.width, frame.height)
      const empty = (reason: string): RemoteObservation => ({
        timestamp,
        width: frame.width,
        height: frame.height,
        feature: null,
        quality: 0,
        reason,
        eyes: [],
        glints: [],
        eyeRegions: [],
        faceBox: roi,
        pose: null,
        basePoint: null,
        method: "IR pupil detection",
        processingMs: performance.now() - started,
      })
      if (disposed) return empty("IR processor stopped")
      if (!roi || !Number.isFinite(timestamp) || timestamp <= lastTimestamp) {
        resetTracking()
        return empty("Waiting for a fresh valid IR frame")
      }
      lastTimestamp = timestamp
      const key = `${frame.width},${frame.height},${roi.x},${roi.y},${roi.width},${roi.height},${settings.threshold}`
      if (key !== regionKey) {
        resetTracking()
        pipeline = null
        regionKey = key
      }
      try {
        const automatic = automaticRegion(settings.roi)
        if (automatic && locator && pipeline !== "closeup") {
          const geometry = inspectRgbFace(
            locator.detect(frame, timestamp),
            frame.width,
            frame.height,
            { requireIris: false, allowPartialEyes: true }
          )
          if (geometry.valid) {
            pipeline = "face"
            const regions = irEyeRegions(geometry, frame.width, frame.height)
            const observed = regions.map((region, i) => {
              const [a, b] = IR_EYE_CORNERS[i].map(
                (index) => geometry.landmarks[index]
              )
              const span = Math.hypot(b[0] - a[0], b[1] - a[1])
              if (region.width < 24 || region.height < 24) return null
              return measure(
                frame,
                region,
                timestamp,
                settings.threshold,
                eyeTrackers[i],
                {
                  center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                  span,
                  angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
                  aperture: irEyeAperture(geometry, i),
                }
              )
            })
            const pupils = observed.map((result) => result?.pupil ?? null)
            const eyes = pupils
              .filter((p): p is Ellipse => p !== null)
              .map((p) => ({ center: p.center, radius: p.major }))
            const glints = observed.flatMap((result) =>
              result?.glint ? [result.glint] : []
            )
            const feedback = {
              eyes,
              glints,
              eyeRegions: regions,
              faceBox: geometry.faceBox,
              pose: geometry.pose,
              method: "IR binocular pupils + head pose",
            }
            if (pupils.some((p) => !p))
              return {
                ...empty("Pupil not clear. Move closer or adjust IR lighting."),
                ...feedback,
              }
            const features = buildIrFaceFeatures(
              geometry,
              pupils.map((p) => p!.center)
            )
            if (!features)
              return { ...empty("IR pupil geometry unavailable"), ...feedback }
            return {
              ...empty(""),
              ...feedback,
              ...features,
              quality: Math.min(
                geometry.quality,
                ...pupils.map((p) => p!.confidence)
              ),
              reason: null,
              processingMs: performance.now() - started,
            }
          }
          if (pipeline === "face" || geometry.reason !== "face-not-found")
            return empty(geometry.reason)
        }
        // A real close-up can use PCCR. Never reinterpret small full-face blobs as a close-up eye.
        const { detected, pupil, glint } = measure(
          frame,
          roi,
          timestamp,
          settings.threshold,
          closeup
        )
        if (
          automatic &&
          pipeline !== "closeup" &&
          (!pupil || pupil.major < Math.sqrt(frame.width * frame.height) * 0.04)
        ) {
          return empty(
            locator
              ? "Face not found. Face the camera or select a close-up eye region."
              : "Automatic eye localization unavailable. Select one eye region."
          )
        }
        if (pupil && automatic) pipeline = "closeup"
        const feedback = {
          eyes: pupil ? [{ center: pupil.center, radius: pupil.major }] : [],
          glints: glint ? [glint] : [],
          eyeRegions: [roi],
          method: "IR pupil / corneal reflection",
        }
        if (!pupil || !glint)
          return {
            ...empty(detected.reason ?? "IR pupil and reflection unavailable"),
            ...feedback,
          }
        const features = buildIrFeatures(
          pupil,
          glint,
          frame.width,
          frame.height
        )
        if (!features.feature.every(Number.isFinite))
          return {
            ...empty("IR reference measurement is invalid"),
            ...feedback,
          }
        return {
          ...empty(""),
          ...feedback,
          ...features,
          quality: detected.quality,
          reason: null,
          processingMs: performance.now() - started,
        }
      } catch {
        resetTracking()
        return empty(
          "IR frame processing failed; check the source and eye region"
        )
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      resetTracking()
      locator?.dispose()
      canvas.width = canvas.height = 1
    },
  }
}
