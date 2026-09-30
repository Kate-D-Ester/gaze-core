import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import type { SceneObservation } from "./scene.types"

// Compiled as a classic worker: MediaPipe 0.10.32 loads its WASM factory with importScripts.
let detector: HandLandmarker | null = null
const base = new URL(".", self.location.href).href
const send = (message: object) => self.postMessage(message)
async function initialize(generation: number) {
  if (typeof OffscreenCanvas === "undefined")
    throw new Error(
      "Hand tracking needs OffscreenCanvas. Use a current Chrome, Edge, Firefox or Safari browser."
    )
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`)
  const canvas = new OffscreenCanvas(640, 480)
  const options = {
    baseOptions: {
      modelAssetPath: new URL("../models/hand_landmarker.task", base).href,
      delegate: "GPU" as "GPU" | "CPU",
    },
    canvas,
    runningMode: "VIDEO" as const,
    numHands: 2,
    minHandDetectionConfidence: 0.7,
    minHandPresenceConfidence: 0.7,
    minTrackingConfidence: 0.7,
  }
  try {
    detector = await HandLandmarker.createFromOptions(fileset, options)
  } catch {
    detector?.close()
    detector = await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    })
  }
  send({ type: "ready", generation })
}
self.onmessage = async (
  event: MessageEvent<{
    type: string
    generation: number
    scene: SceneObservation
    bitmap: ImageBitmap
  }>
) => {
  const message = event.data
  try {
    if (message.type === "init") {
      detector?.close()
      await initialize(message.generation)
    } else if (message.type === "frame") {
      try {
        if (!detector) throw new Error("The hand detector has not loaded yet.")
        const result = detector.detectForVideo(
          message.bitmap,
          message.scene.timestamp
        )
        send({
          type: "result",
          generation: message.generation,
          scene: message.scene,
          landmarks: result.landmarks,
          worldLandmarks: result.worldLandmarks,
          handedness: result.handedness.map(
            (categories) => categories[0]?.categoryName ?? "Unknown"
          ),
        })
      } finally {
        message.bitmap.close()
      }
    }
  } catch (error) {
    send({
      type: "error",
      generation: message.generation,
      error: error instanceof Error ? error.message : "Hand detection failed.",
    })
  }
}
