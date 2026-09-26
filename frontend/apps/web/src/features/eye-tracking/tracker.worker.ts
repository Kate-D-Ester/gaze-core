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
      request.timestamp
    )
    self.postMessage(
      {
        type: "frame",
        frame,
        data: request.data,
        generation: request.generation,
      },
      [request.data.buffer as ArrayBuffer]
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
