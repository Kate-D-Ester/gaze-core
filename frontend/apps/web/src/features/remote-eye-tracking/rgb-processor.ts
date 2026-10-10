import * as tf from "@tensorflow/tfjs"
import { createLandmarker } from "./face-landmarker"
import type {
  Point,
  RemoteObservation,
  RemoteProcessingTiming,
  RemoteProcessor,
} from "./remote-eye-tracking.types"
import {
  buildRgbFeatures,
  inspectRgbFace,
  prepareBlazeGazeGeometry,
  type RgbPixels,
} from "./rgb-features"
import { selectRgbBackend } from "./rgb-backend"
import { releaseUnusedRgbBackends } from "./rgb-backend-resources"
import type { RgbAppearanceReadout } from "./rgb-appearance.types"
import type { RgbBackend } from "./rgb-backend.types"
import { createRgbEyePatchPlan, sampleRgbEyePatch } from "./rgb-eye-patch"
import { reusableRgbGeometry } from "./rgb-geometry-history"
import type { RgbGeometryHistory } from "./rgb-geometry-history.types"
import { RGB_BASE_MODEL_VERSION } from "./rgb-model-version"
import { refineRgbIrisOffsets } from "./rgb-iris-features"
import { buildTrackingVectors } from "./tracking-vectors"
import {
  createRgbAppearanceReadout,
  runRgbAppearanceReadout,
  RGB_EMBEDDING_VERSION,
} from "./rgb-appearance"
export {
  createRgbAppearanceReadout,
  runRgbAppearanceReadout,
} from "./rgb-appearance"
export const RGB_METHODS = {
  mobile: "Local BlazeGaze + iris + handheld head pose",
  webcam: "Local BlazeGaze + iris + desktop head pose",
} as const
const ASSETS = "/models/remote-eye-tracking"
/** Loads and checks the pretrained three-input model before exposing a processor. */
export async function loadRgbAppearanceModel(
  source: string | tf.io.IOHandler
): Promise<tf.LayersModel> {
  const model = await tf.loadLayersModel(source)
  const shapes = model.inputs.map((input) => input.shape)
  if (
    shapes.length !== 3 ||
    shapes[0].slice(1).join(",") !== "128,512,3" ||
    shapes[1][1] !== 3 ||
    shapes[2][1] !== 3 ||
    model.outputs.length !== 1 ||
    model.outputs[0].shape[1] !== 2
  ) {
    model.dispose()
    throw new Error(
      "The bundled RGB appearance model has incompatible inputs or outputs"
    )
  }
  model.trainable = false
  return model
}
/** All tensors, including unwanted prediction outputs, are scoped/disposed per frame. */
export async function runRgbAppearanceModel(
  model: tf.LayersModel | RgbAppearanceReadout,
  patch: RgbPixels,
  headVector: [number, number, number],
  faceOrigin: [number, number, number]
): Promise<Point | null> {
  const result = await runRgbAppearanceReadout(
    model,
    patch,
    headVector,
    faceOrigin
  )
  return result.point
}

async function activateTensorBackend(backend: RgbBackend): Promise<boolean> {
  try {
    if (!(await tf.setBackend(backend))) {
      return false
    }
    await tf.ready()
    if (backend === "webgl") {
      // Avoid changing calibration features on GPUs limited to half precision.
      return (
        tf.env().getBool("WEBGL_RENDER_FLOAT32_CAPABLE") &&
        tf.env().getBool("WEBGL_RENDER_FLOAT32_ENABLED")
      )
    }
    return true
  } catch {
    return false
  }
}
async function initializeTensorBackend(
  mode: "mobile" | "webcam"
): Promise<RgbBackend> {
  const { setWasmPaths } = await import("@tensorflow/tfjs-backend-wasm")
  setWasmPaths(`${ASSETS}/tfjs-wasm/`)
  // Workers without cross-origin isolation cannot use SharedArrayBuffer. Single-thread SIMD
  // keeps the local WASM fallback available without adding deployment-header requirements.
  tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false)
  const candidates: RgbBackend[] =
    mode === "mobile" ? ["wasm", "webgl", "cpu"] : ["webgl", "wasm", "cpu"]
  for (const backend of candidates) {
    if (await activateTensorBackend(backend)) {
      return backend
    }
  }
  throw new Error("No local TensorFlow inference backend is available")
}
function createBenchmarkEyePatch(sample: number): RgbPixels {
  const width = 512
  const height = 128
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      data[index] = (x + sample * 61) % 256
      data[index + 1] = (y * 2 + sample * 37) % 256
      data[index + 2] = (x + y + sample * 23) % 256
      data[index + 3] = 255
    }
  }
  return { width, height, data }
}
/** Lazy, entirely same-origin inference. The caller owns and closes each transferred bitmap. */
export async function createRgbProcessor(
  mode: "mobile" | "webcam"
): Promise<RemoteProcessor> {
  const preferredBackend = await initializeTensorBackend(mode)
  const {
    landmarker,
    canvas: visionCanvas,
    delegate,
  } = await createLandmarker()
  let model: tf.LayersModel
  try {
    model = await loadRgbAppearanceModel(`${ASSETS}/blazegaze/model.json`)
  } catch (error) {
    landmarker.close()
    visionCanvas.width = visionCanvas.height = 0
    throw error
  }
  let readout: RgbAppearanceReadout | null = null
  let backend: RgbBackend
  try {
    readout = createRgbAppearanceReadout(model)
    const patches = [createBenchmarkEyePatch(0), createBenchmarkEyePatch(1)]
    backend = await selectRgbBackend(preferredBackend, {
      activate: activateTensorBackend,
      predict: (sample) =>
        runRgbAppearanceModel(
          readout!,
          patches[sample]!,
          [0, 0, -1],
          [0, 0, 60]
        ),
      now: () => performance.now(),
    })
    // Restore warmed weights to the chosen backend before the first camera frame.
    await runRgbAppearanceModel(readout, patches[0]!, [0, 0, -1], [0, 0, 60])
    releaseUnusedRgbBackends(model)
  } catch (error) {
    model.dispose()
    landmarker.close()
    visionCanvas.width = visionCanvas.height = 0
    throw error
  }
  const canvas = new OffscreenCanvas(1, 1)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    model.dispose()
    landmarker.close()
    visionCanvas.width = visionCanvas.height = 0
    throw new Error(
      "Unable to read camera pixels for local eye appearance inference"
    )
  }
  let disposed = false
  let busy = false
  let lastTimestamp = -Infinity
  let physicalHistory: RgbGeometryHistory | null = null
  let previousSize = ""
  const method = `${RGB_METHODS[mode]} (${delegate}/${backend})`
  return {
    async process(
      frame: ImageBitmap,
      timestamp: number
    ): Promise<RemoteObservation> {
      const start = performance.now()
      const width = frame.width
      const height = frame.height
      const timing: RemoteProcessingTiming = {}
      const empty = (reason: string): RemoteObservation => ({
        timestamp,
        width,
        height,
        feature: null,
        quality: 0,
        reason,
        eyes: [],
        faceBox: null,
        pose: null,
        basePoint: null,
        method,
        processingMs: performance.now() - start,
        timing,
      })
      if (disposed) {
        return empty("processor-disposed")
      }
      if (busy) {
        return empty("processor-busy")
      }
      if (
        !Number.isFinite(timestamp) ||
        timestamp < 0 ||
        timestamp <= lastTimestamp
      ) {
        return empty("stale-frame")
      }
      if (!(width > 0 && height > 0)) {
        return empty("invalid-frame")
      }
      lastTimestamp = timestamp
      busy = true
      try {
        const size = `${width}x${height}`
        if (size !== previousSize) {
          canvas.width = width
          canvas.height = height
          physicalHistory = null
          previousSize = size
        }
        const landmarksStart = performance.now()
        const result = landmarker.detectForVideo(frame, timestamp)
        const geometry = inspectRgbFace(result, width, height)
        timing.landmarksMs = performance.now() - landmarksStart
        const previous = reusableRgbGeometry(physicalHistory, {
          timestamp,
          width,
          height,
          reason: geometry.valid ? null : geometry.reason,
        })
        if (!previous) {
          physicalHistory = null
        }
        if (!geometry.valid) {
          return empty(geometry.reason)
        }
        const patchPlanStart = performance.now()
        const plan = createRgbEyePatchPlan(width, height, geometry.landmarks)
        const rect = plan.sourceRect
        const readbackStart = performance.now()
        let pixels: ImageData | null = null
        if (rect) {
          context.drawImage(
            frame,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            rect.x,
            rect.y,
            rect.width,
            rect.height
          )
          pixels = context.getImageData(rect.x, rect.y, rect.width, rect.height)
        }
        timing.readbackMs = performance.now() - readbackStart
        timing.readbackPixels = rect ? rect.width * rect.height : 0
        const patchStart = performance.now()
        const origin: Point = rect ? [rect.x, rect.y] : [0, 0]
        const patch = sampleRgbEyePatch(pixels, plan, origin)
        timing.eyePatchMs =
          performance.now() - patchStart + (readbackStart - patchPlanStart)
        const irisStart = performance.now()
        const irisRefinement = refineRgbIrisOffsets(pixels, origin, geometry)
        timing.irisRefinementMs = performance.now() - irisStart
        const geometryStart = performance.now()
        const input = prepareBlazeGazeGeometry(
          geometry,
          width,
          height,
          previous
        )
        timing.geometryMs = performance.now() - geometryStart
        const appearanceStart = performance.now()
        const appearance = await runRgbAppearanceReadout(
          readout!,
          patch,
          input.headVector,
          input.faceOrigin
        )
        timing.appearanceMs = performance.now() - appearanceStart
        const basePoint = appearance.point
        const feature = buildRgbFeatures(mode, geometry, basePoint)
        if (disposed) {
          return empty("processor-disposed")
        }
        if (!feature) {
          physicalHistory = null
          return empty("invalid-appearance-prediction")
        }
        physicalHistory = {
          model: {
            faceWidthCm: input.faceWidthCm,
            depth: input.faceOrigin[2],
          },
          width,
          height,
          timestamp,
        }
        return {
          timestamp,
          width,
          height,
          feature,
          quality: geometry.quality,
          reason: null,
          eyes: geometry.eyes,
          faceBox: geometry.faceBox,
          pose: geometry.pose,
          basePoint,
          baseModelVersion: RGB_BASE_MODEL_VERSION,
          appearanceEmbedding: appearance.embedding ?? undefined,
          appearanceVersion: RGB_EMBEDDING_VERSION,
          irisRefinement,
          vectors: buildTrackingVectors(geometry),
          method,
          processingMs: performance.now() - start,
          timing,
        }
      } catch (error) {
        physicalHistory = null
        return empty(
          `RGB inference failed: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        busy = false
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      physicalHistory = null
      model.dispose()
      landmarker.close()
      canvas.width = canvas.height = 0
      const gl = visionCanvas.getContext("webgl2")
      gl?.getExtension("WEBGL_lose_context")?.loseContext()
      visionCanvas.width = visionCanvas.height = 0
    },
  }
}
