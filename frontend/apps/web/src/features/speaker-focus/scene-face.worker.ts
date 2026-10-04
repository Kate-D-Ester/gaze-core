import { faceBox } from "./face-locations"
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision"
import type {
  FacePreviewReply,
  FacePreviewRequest,
} from "./scene-face-preview.types"
import type { Box } from "./client.types"
let detector: FaceLandmarker | null = null
let lastTimestamp = -1
const base = new URL(".", self.location.href).href
function send(reply: FacePreviewReply): void {
  self.postMessage(reply)
}
self.onmessage = async (event: MessageEvent<FacePreviewRequest>) => {
  const message = event.data
  try {
    if (message.type === "init") {
      detector?.close()
      const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`)
      detector = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: new URL(
            "../models/remote-eye-tracking/face_landmarker.task",
            base
          ).href,
          delegate: "CPU",
        },
        canvas: new OffscreenCanvas(640, 480),
        runningMode: "VIDEO",
        numFaces: 6,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
      lastTimestamp = -1
      send({ type: "ready", generation: message.generation })
    } else {
      if (!detector) {
        throw new Error("Face preview has not loaded yet.")
      }
      lastTimestamp = Math.max(lastTimestamp + 1, message.scene.timestamp)
      let image: ImageBitmap | OffscreenCanvas = message.bitmap
      if (message.region) {
        const [x, y, w, h] = message.region
        const width = Math.max(1, Math.round(w * message.bitmap.width))
        const height = Math.max(1, Math.round(h * message.bitmap.height))
        const crop = new OffscreenCanvas(width, height)
        const context = crop.getContext("2d")
        if (!context) {
          throw new Error("Face region preview is unavailable.")
        }
        context.drawImage(
          message.bitmap,
          x * message.bitmap.width,
          y * message.bitmap.height,
          w * message.bitmap.width,
          h * message.bitmap.height,
          0,
          0,
          width,
          height
        )
        image = crop
      }
      const result = detector.detectForVideo(image, lastTimestamp)
      const boxes: Box[] = result.faceLandmarks.flatMap((landmarks) => {
        const box = faceBox(
          landmarks.map((point) => [point.x, point.y]),
          message.region
        )
        return box ? [box] : []
      })
      send({
        type: "faces",
        generation: message.generation,
        scene: message.scene,
        revision: message.revision,
        boxes,
      })
    }
  } catch (error) {
    send({
      type: "error",
      generation: message.generation,
      error: error instanceof Error ? error.message : "Face preview failed.",
    })
  } finally {
    if (message.type === "frame") {
      message.bitmap.close()
    }
  }
}
