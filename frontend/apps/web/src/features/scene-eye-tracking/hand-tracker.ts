import type { SceneCamera } from "./scene-camera"
import type { HandObservation, SceneObservation } from "./scene.types"

export type HandTrackerSnapshot = {
  status: "idle" | "loading" | "ready" | "error"
  error: string
  hand: HandObservation | null
}
export class HandTracker {
  private snapshot: HandTrackerSnapshot = {
    status: "idle",
    error: "",
    hand: null,
  }
  private listeners = new Set<() => void>()
  private worker: Worker | null = null
  private unsubscribe: (() => void) | null = null
  private generation = 0
  private inflight = false
  private lastId = -1
  private lastSourceGeneration = -1
  private camera: SceneCamera
  private factory: () => Worker
  private makeBitmap: (image: HTMLCanvasElement) => Promise<ImageBitmap>
  constructor(
    camera: SceneCamera,
    factory = () =>
      new Worker(
        `${import.meta.env?.BASE_URL ?? "/"}vision-runtime/scene-hand.worker.js`
      ),
    makeBitmap: (image: HTMLCanvasElement) => Promise<ImageBitmap> = (image) =>
      createImageBitmap(image)
  ) {
    this.camera = camera
    this.factory = factory
    this.makeBitmap = makeBitmap
  }
  getSnapshot = () => this.snapshot
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private update(next: Partial<HandTrackerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((fn) => fn())
  }
  start() {
    this.dispose()
    this.update({ status: "loading", error: "", hand: null })
    const epoch = this.generation
    try {
      const worker = this.factory()
      this.worker = worker
      worker.onmessage = (event: MessageEvent) => {
        const message = event.data
        if (epoch !== this.generation || message.generation !== epoch) return
        if (message.type === "ready") {
          this.update({ status: "ready" })
          this.pump()
        } else if (message.type === "error") {
          this.inflight = false
          this.update({ status: "error", error: message.error, hand: null })
        } else if (message.type === "result") {
          this.inflight = false
          if (message.scene.generation !== this.camera.latest?.generation)
            return
          this.update({
            hand: {
              scene: message.scene,
              landmarks: message.landmarks,
              worldLandmarks: message.worldLandmarks,
              handedness: message.handedness,
            },
          })
        }
      }
      worker.onerror = () => {
        if (epoch === this.generation) {
          this.inflight = false
          this.update({
            status: "error",
            error:
              "Hand tracking could not start. Reload its assets or retry in a browser with WebAssembly and OffscreenCanvas.",
            hand: null,
          })
        }
      }
      worker.onmessageerror = () => {
        if (epoch === this.generation)
          this.update({
            status: "error",
            error:
              "The hand worker returned unreadable data. Retry hand tracking.",
            hand: null,
          })
      }
      this.unsubscribe = this.camera.subscribe(this.pump)
      worker.postMessage({ type: "init", generation: epoch })
    } catch (error) {
      this.update({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "This browser cannot run the hand worker.",
        hand: null,
      })
    }
  }
  private pump = () => {
    const scene = this.camera.latest
    if (!scene) {
      if (this.snapshot.hand) this.update({ hand: null })
      return
    }
    if (
      this.snapshot.status !== "ready" ||
      !this.worker ||
      this.inflight ||
      scene.id === this.lastId
    )
      return
    if (this.lastSourceGeneration !== scene.generation) {
      this.lastId = -1
      this.lastSourceGeneration = scene.generation
      this.update({ hand: null })
    }
    this.inflight = true
    this.lastId = scene.id
    const epoch = this.generation,
      captured: SceneObservation = { ...scene }
    void this.makeBitmap(this.camera.rawCanvas)
      .then((bitmap) => {
        if (
          epoch !== this.generation ||
          captured.generation !== this.camera.latest?.generation ||
          !this.worker
        ) {
          bitmap.close()
          if (epoch === this.generation) this.inflight = false
          return
        }
        try {
          this.worker.postMessage(
            { type: "frame", generation: epoch, scene: captured, bitmap },
            [bitmap]
          )
        } catch (error) {
          bitmap.close()
          throw error
        }
      })
      .catch((error) => {
        if (epoch === this.generation) {
          this.inflight = false
          this.update({
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Unable to read the scene camera for hand tracking.",
            hand: null,
          })
        }
      })
  }
  dispose() {
    this.generation++
    this.unsubscribe?.()
    this.unsubscribe = null
    this.worker?.terminate()
    this.worker = null
    this.inflight = false
    this.lastId = -1
    this.lastSourceGeneration = -1
  }
}
