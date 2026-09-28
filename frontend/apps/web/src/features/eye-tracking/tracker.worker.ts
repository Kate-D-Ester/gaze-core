/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope
import { TrackingEngine } from "./engine"
import { loadOpenCv } from "./opencv"
import type { FrameSettings } from "./types"
export type WorkerRequest = {
  type: "frame"
  data: Uint8ClampedArray
  width: number
  height: number
  settings: FrameSettings
  id: number
  timestamp: number
  generation: number
  includePreviewMasks?: boolean
  evaluateAllThresholds?: boolean
}
let engine: TrackingEngine | null = null
let generation = -1
loadOpenCv()
  .then(({ cv }) => {
    engine = new TrackingEngine(cv)
    self.postMessage({ type: "ready" })
  })
  .catch((error) =>
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not load vision engine.",
    })
  )
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (!engine) return
  try {
    if (generation !== request.generation) {
      engine.reset()
      generation = request.generation
    }
    const frame = engine.process(
      request.data,
      request.width,
      request.height,
      request.settings,
      request.id,
      request.timestamp,
      request.includePreviewMasks,
      request.evaluateAllThresholds
    )
    // Contour point clouds are used only inside the worker's pupil selection;
    // the UI renders the fitted ellipse, so don't clone these large arrays.
    frame.detection.contour.length = 0
    frame.detection.refined.length = 0
    const transferables: Transferable[] = [
      request.data.buffer as ArrayBuffer,
      ...frame.detection.previews.flatMap((preview) =>
        preview.mask ? [preview.mask.buffer as ArrayBuffer] : []
      ),
    ]
    self.postMessage(
      {
        type: "frame",
        frame,
        data: request.data,
        generation: request.generation,
      },
      transferables
    )
  } catch (error) {
    self.postMessage({
      type: "error",
      generation: request.generation,
      message:
        error instanceof Error
          ? error.message
          : "Could not process this camera frame.",
    })
  }
}
