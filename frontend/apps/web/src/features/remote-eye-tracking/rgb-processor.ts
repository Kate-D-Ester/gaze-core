import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"
import * as tf from "@tensorflow/tfjs"
import {
  buildRgbFeatures,
  extractRgbEyePatch,
  inspectRgbFace,
  modelPredictionToScreen,
  prepareBlazeGazeGeometry,
  type RgbPixels,
} from "./rgb-features"
import type { Point, RemoteObservation, RemoteProcessor } from "./types"

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
  model: tf.LayersModel,
  patch: RgbPixels,
  headVector: [number, number, number],
  faceOrigin: [number, number, number]
): Promise<Point | null> {
  if (
    patch.width !== 512 ||
    patch.height !== 128 ||
    patch.data.length !== 512 * 128 * 4 ||
    ![...headVector, ...faceOrigin].every(Number.isFinite)
  ) {
    throw new Error("Invalid RGB appearance input")
  }
  const output = tf.tidy(() => {
    const pixels = {
      ...patch,
      data: new Uint8Array(
        patch.data.buffer,
        patch.data.byteOffset,
        patch.data.byteLength
      ),
    }
    const image = tf.browser
      .fromPixels(pixels, 3)
      .toFloat()
      .div(255)
      .expandDims(0)
    const head = tf.tensor2d(headVector, [1, 3])
    const origin = tf.tensor2d(faceOrigin, [1, 3])
    const prediction = model.predict([image, head, origin])
    return Array.isArray(prediction) ? prediction[0] : prediction
  })
  try {
    return modelPredictionToScreen(await output.data())
  } finally {
    output.dispose()
  }
}

async function initializeTensorBackend(
  mode: "mobile" | "webcam"
): Promise<string> {
  const { setWasmPaths } = await import("@tensorflow/tfjs-backend-wasm")
  setWasmPaths(`${ASSETS}/tfjs-wasm/`)
  // Workers without cross-origin isolation cannot use SharedArrayBuffer. Single-thread SIMD
  // keeps the local WASM fallback available without adding deployment-header requirements.
  tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false)
  const candidates =
    mode === "mobile" ? ["wasm", "webgl", "cpu"] : ["webgl", "wasm", "cpu"]
  for (const backend of candidates) {
    try {
      if (await tf.setBackend(backend)) {
        await tf.ready()
        return backend
      }
    } catch {
      // GPU availability and WASM support vary in browser workers, especially Safari.
    }
  }
  throw new Error("No local TensorFlow inference backend is available")
}

async function createLandmarker(): Promise<{
  landmarker: FaceLandmarker
  canvas: OffscreenCanvas
  delegate: "GPU" | "CPU"
}> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error(
      "Local RGB tracking requires a browser with OffscreenCanvas support"
    )
  }
  const fileset = await FilesetResolver.forVisionTasks(
    `${ASSETS}/mediapipe`,
    true
  )
  // The ES-module loader is cached by import(). MediaPipe clears ModuleFactory after each
  // creation, so restore the exported factory for each delegate attempt/reinitialization.
  const loaderUrl = new URL(fileset.wasmLoaderPath, globalThis.location.origin)
    .href
  const loader = (await import(/* @vite-ignore */ loaderUrl)) as {
    default: unknown
  }
  const scope = globalThis as typeof globalThis & {
    ModuleFactory?: unknown
    Module?: unknown
  }
  for (const delegate of ["GPU", "CPU"] as const) {
    const canvas = new OffscreenCanvas(1, 1)
    try {
      scope.ModuleFactory = loader.default
      const landmarker = await FaceLandmarker.createFromOptions(
        { ...fileset, wasmLoaderPath: "" },
        {
          baseOptions: {
            modelAssetPath: `${ASSETS}/face_landmarker.task`,
            delegate,
          },
          canvas,
          runningMode: "VIDEO",
          numFaces: 2,
          minFaceDetectionConfidence: 0.6,
          minFacePresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }
      )
      return { landmarker, canvas, delegate }
    } catch (error) {
      canvas.width = canvas.height = 0
      if (delegate === "CPU")
        throw new Error(
          `Unable to initialize local face/iris inference: ${error instanceof Error ? error.message : String(error)}`
        )
    } finally {
      delete scope.ModuleFactory
      delete scope.Module
    }
  }
  throw new Error("No local face inference delegate is available")
}

/** Lazy, entirely same-origin inference. The caller owns and closes each transferred bitmap. */
export async function createRgbProcessor(
  mode: "mobile" | "webcam"
): Promise<RemoteProcessor> {
  const backend = await initializeTensorBackend(mode)
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
  let disposed = false,
    busy = false,
    lastTimestamp = -Infinity
  let previous: { faceWidthCm: number; depth: number } | undefined
  let previousSize = ""
  const method = `${RGB_METHODS[mode]} (${delegate}/${backend})`

  return {
    async process(
      frame: ImageBitmap,
      timestamp: number
    ): Promise<RemoteObservation> {
      const start = performance.now(),
        width = frame.width,
        height = frame.height
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
      })
      if (disposed) return empty("processor-disposed")
      if (busy) return empty("processor-busy")
      if (
        !Number.isFinite(timestamp) ||
        timestamp < 0 ||
        timestamp <= lastTimestamp
      )
        return empty("stale-frame")
      if (!(width > 0 && height > 0)) return empty("invalid-frame")
      lastTimestamp = timestamp
      busy = true
      try {
        const size = `${width}x${height}`
        if (size !== previousSize) {
          canvas.width = width
          canvas.height = height
          previous = undefined
          previousSize = size
        }
        const result = landmarker.detectForVideo(frame, timestamp)
        const geometry = inspectRgbFace(result, width, height)
        if (!geometry.valid) {
          previous = undefined
          return empty(geometry.reason)
        }
        context.drawImage(frame, 0, 0)
        const pixels = context.getImageData(0, 0, width, height)
        const patch = extractRgbEyePatch(pixels, geometry.landmarks)
        const input = prepareBlazeGazeGeometry(
          geometry,
          width,
          height,
          previous
        )
        const basePoint = await runRgbAppearanceModel(
          model,
          patch,
          input.headVector,
          input.faceOrigin
        )
        const feature = buildRgbFeatures(mode, geometry, basePoint)
        if (disposed) return empty("processor-disposed")
        if (!feature) {
          previous = undefined
          return empty("invalid-appearance-prediction")
        }
        previous = {
          faceWidthCm: input.faceWidthCm,
          depth: input.faceOrigin[2],
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
          method,
          processingMs: performance.now() - start,
        }
      } catch (error) {
        previous = undefined
        return empty(
          `RGB inference failed: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        busy = false
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      previous = undefined
      model.dispose()
      landmarker.close()
      canvas.width = canvas.height = 0
      const gl = visionCanvas.getContext("webgl2")
      gl?.getExtension("WEBGL_lose_context")?.loseContext()
      visionCanvas.width = visionCanvas.height = 0
    },
  }
}
