import type { Box } from "./client.types"
import { SceneSourceIdentity } from "./scene-frame"
import { FaceLocations } from "./face-locations"
import type {
  FacePreviewReply,
  FacePreviewSnapshot,
} from "./scene-face-preview.types"
import type { SceneCamera } from "../scene-eye-tracking/scene-camera"
export class SceneFacePreview {
  private snapshot: FacePreviewSnapshot = {
    status: "idle",
    tracks: [],
    error: "",
  }
  private listeners = new Set<() => void>()
  private worker: Worker | null = null
  private unsubscribe: (() => void) | null = null
  private epoch = 0
  private inflight = false
  private lastTimestamp = -Infinity
  private sourceGeneration = -1
  private sourceIdentity = ""
  private readonly sceneIdentity = new SceneSourceIdentity()
  private locations = new FaceLocations()
  private region: Box | null = null
  private revision = 0
  constructor(
    private readonly camera: SceneCamera,
    private readonly factory = () =>
      new Worker("/vision-runtime/scene-face.worker.js"),
    private readonly makeBitmap = (image: HTMLCanvasElement) => {
      const scale = Math.min(1, 640 / Math.max(image.width, image.height))
      return createImageBitmap(image, {
        resizeWidth: Math.max(1, Math.round(image.width * scale)),
        resizeHeight: Math.max(1, Math.round(image.height * scale)),
        resizeQuality: "low",
      })
    }
  ) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<FacePreviewSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  start(): void {
    const region = this.region
    this.dispose()
    this.region = region
    this.update({ status: "loading", tracks: [], error: "" })
    const epoch = this.epoch
    try {
      const worker = this.factory()
      this.worker = worker
      worker.onmessage = (event: MessageEvent<FacePreviewReply>) => {
        const message = event.data
        if (epoch !== this.epoch || message.generation !== epoch) {
          return
        }
        if (message.type === "ready") {
          this.update({ status: "ready" })
          this.pump()
        } else if (message.type === "error") {
          this.update({ status: "error", error: message.error, tracks: [] })
          this.inflight = false
        } else {
          this.inflight = false
          if (
            message.scene.generation === this.camera.latest?.generation &&
            message.revision === this.revision
          ) {
            this.update({
              tracks: this.locations
                .update(message.boxes, message.scene.timestamp / 1000)
                .map((track) => ({ ...track, manual: this.region !== null })),
            })
          }
          this.pump()
        }
      }
      const failed = () => {
        if (epoch === this.epoch) {
          this.update({
            status: "error",
            tracks: [],
            error: "Face preview stopped. Retry face detection.",
          })
        }
      }
      worker.onerror = failed
      worker.onmessageerror = failed
      this.unsubscribe = this.camera.subscribe(this.pump)
      worker.postMessage({ type: "init", generation: epoch })
    } catch {
      this.update({
        status: "error",
        tracks: [],
        error:
          "Face preview is unavailable. Use a browser with WebAssembly and OffscreenCanvas.",
      })
    }
  }
  correct(region: Readonly<Box> | null): void {
    this.region = region ? [...region] : null
    this.revision++
    this.locations.reset()
    this.lastTimestamp = -Infinity
    this.update({ tracks: [] })
    this.pump()
  }
  private pump = (): void => {
    const scene = this.camera.latest
    if (!scene) {
      if (this.snapshot.tracks.length) {
        this.update({ tracks: [] })
      }
      return
    }
    const snapshot = this.camera.getSnapshot()
    const identity = this.sceneIdentity.observe(
      JSON.stringify(snapshot.transform),
      scene,
      snapshot.source?.key
    )
    if (
      scene.generation !== this.sourceGeneration ||
      identity !== this.sourceIdentity
    ) {
      if (this.sourceIdentity && identity !== this.sourceIdentity) {
        this.region = null
        this.revision++
      }
      this.sourceIdentity = identity
      this.sourceGeneration = scene.generation
      this.lastTimestamp = -Infinity
      this.locations.reset()
      this.update({ tracks: [] })
    }
    if (
      this.snapshot.status !== "ready" ||
      !this.worker ||
      this.inflight ||
      scene.timestamp - this.lastTimestamp < 180
    ) {
      return
    }
    const epoch = this.epoch
    const captured = { ...scene }
    const region = this.region
    const revision = this.revision
    this.inflight = true
    this.lastTimestamp = scene.timestamp
    void this.makeBitmap(this.camera.rawCanvas)
      .then((bitmap) => {
        if (
          epoch !== this.epoch ||
          captured.generation !== this.camera.latest?.generation ||
          !this.worker
        ) {
          bitmap.close()
          if (epoch === this.epoch) {
            this.inflight = false
          }
          return
        }
        try {
          this.worker.postMessage(
            {
              type: "frame",
              generation: epoch,
              scene: captured,
              bitmap,
              region,
              revision,
            },
            [bitmap]
          )
        } catch (error) {
          bitmap.close()
          throw error
        }
      })
      .catch(() => {
        if (epoch === this.epoch) {
          this.inflight = false
          this.update({
            status: "error",
            tracks: [],
            error:
              "The scene camera could not be read for face preview. Retry face detection.",
          })
        }
      })
  }
  dispose(): void {
    this.epoch++
    this.unsubscribe?.()
    this.unsubscribe = null
    this.worker?.terminate()
    this.worker = null
    this.inflight = false
    this.lastTimestamp = -Infinity
    this.sourceGeneration = -1
    this.sourceIdentity = ""
    this.locations.reset()
    this.region = null
    this.revision = 0
  }
}
