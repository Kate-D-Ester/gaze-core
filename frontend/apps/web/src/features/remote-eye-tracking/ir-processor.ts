import { loadOpenCv } from "../eye-tracking/opencv"
import { buildIrFeatures, detectIrEye, type IrReference } from "./ir-features"
import type { Rect, RemoteObservation, RemoteProcessor } from "./types"

const method = "IR pupil / corneal reflection"
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
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const x = Math.floor(clamp(roi.x) * width),
    y = Math.floor(clamp(roi.y) * height)
  const right = Math.ceil(clamp(roi.x + roi.width) * width),
    bottom = Math.ceil(clamp(roi.y + roi.height) * height)
  return right - x >= 24 && bottom - y >= 24
    ? { x, y, width: right - x, height: bottom - y }
    : null
}

/** Instantiate inside the remote-processing worker; frames never leave the device. */
export async function createIrProcessor(): Promise<RemoteProcessor> {
  if (typeof OffscreenCanvas === "undefined")
    throw new Error(
      "IR processing requires worker canvas support in this browser"
    )
  const { cv } = await loadOpenCv()
  const canvas = new OffscreenCanvas(1, 1)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context)
    throw new Error("The IR worker could not create its image canvas")
  let previous: IrReference | null = null
  let regionKey = ""
  let disposed = false

  return {
    async process(frame, timestamp, settings) {
      const started = performance.now()
      const roi = pixelRoi(settings.roi, frame.width, frame.height)
      const empty = (reason: string): RemoteObservation => ({
        timestamp,
        width: frame.width,
        height: frame.height,
        feature: null,
        quality: 0,
        reason,
        eyes: [],
        faceBox: roi,
        pose: null,
        basePoint: null,
        method,
        processingMs: performance.now() - started,
      })
      if (disposed) return empty("IR processor stopped")
      if (!roi || !Number.isFinite(timestamp)) {
        previous = null
        return empty("Select an eye region at least 24 pixels across")
      }
      const scale = Math.min(
        1,
        maxProcessingDimension / Math.max(roi.width, roi.height)
      )
      const width = Math.max(1, Math.round(roi.width * scale)),
        height = Math.max(1, Math.round(roi.height * scale))
      const key = `${frame.width},${frame.height},${roi.x},${roi.y},${roi.width},${roi.height},${settings.threshold}`
      if (key !== regionKey) {
        previous = null
        regionKey = key
      }
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      try {
        context.drawImage(
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
        const rgba = context.getImageData(0, 0, width, height).data
        const gray = new Uint8Array(width * height)
        for (let i = 0; i < gray.length; i++)
          gray[i] = Math.round(
            0.299 * rgba[i * 4] +
              0.587 * rgba[i * 4 + 1] +
              0.114 * rgba[i * 4 + 2]
          )
        const detected = detectIrEye(
          cv,
          gray,
          width,
          height,
          settings.threshold,
          timestamp,
          previous
        )
        if (detected.reference) previous = detected.reference
        else if (
          previous &&
          (timestamp < previous.timestamp ||
            timestamp - previous.timestamp > 250)
        )
          previous = null
        if (!detected.pupil || !detected.glint)
          return empty(
            detected.reason ?? "IR pupil and corneal reflection unavailable"
          )
        const scaleX = roi.width / width,
          scaleY = roi.height / height
        const pupil = {
          ...detected.pupil,
          center: [
            roi.x + detected.pupil.center[0] * scaleX,
            roi.y + detected.pupil.center[1] * scaleY,
          ] as [number, number],
          major: detected.pupil.major * Math.sqrt(scaleX * scaleY),
          minor: detected.pupil.minor * Math.sqrt(scaleX * scaleY),
        }
        const glint: [number, number] = [
          roi.x + detected.glint[0] * scaleX,
          roi.y + detected.glint[1] * scaleY,
        ]
        const features = buildIrFeatures(
          pupil,
          glint,
          frame.width,
          frame.height
        )
        if (!features.feature.every(Number.isFinite))
          return empty("IR reference measurement is invalid")
        return {
          timestamp,
          width: frame.width,
          height: frame.height,
          ...features,
          quality: detected.quality,
          reason: null,
          eyes: [{ center: pupil.center, radius: pupil.major }],
          faceBox: roi,
          method,
          processingMs: performance.now() - started,
        }
      } catch {
        previous = null
        return empty(
          "IR frame processing failed; check the source and eye region"
        )
      }
    },
    dispose() {
      disposed = true
      previous = null
      canvas.width = 1
      canvas.height = 1
    },
  }
}
