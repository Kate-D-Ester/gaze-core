import { hasFreshFrame } from "./selection"
import type { ViewerCamera } from "./viewer-camera.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type {
  FrameContext,
  ObjectBox,
  ObjectChoice,
  ObjectTrackingSnapshot,
  TrackingDependencies,
  VisionRecord,
  VisionTransport,
} from "./object-tracking.types"

const empty = (): ObjectTrackingSnapshot => ({
  status: "idle",
  reference: null,
  match: null,
  error: "",
})
export function validObjectBox(value: unknown): value is ObjectBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1
    ) &&
    value[0] < value[2] &&
    value[1] < value[3]
  )
}
export function transformKey(state: SceneCameraSnapshot) {
  const { rotation, mirrorX, mirrorY } = state.transform
  return `${rotation}:${mirrorX}:${mirrorY}`
}
export function sameSource(context: FrameContext, state: SceneCameraSnapshot) {
  return (
    state.source?.key === context.sourceKey &&
    transformKey(state) === context.transformKey &&
    (!state.frame || state.frame.generation === context.generation)
  )
}
function context(state: SceneCameraSnapshot): FrameContext {
  return {
    sourceKey: state.source!.key,
    transformKey: transformKey(state),
    generation: state.frame!.generation,
    timestamp: state.frame!.timestamp,
  }
}
function encodeFrame(camera: ViewerCamera) {
  const source = camera.rawCanvas
  const canvas = document.createElement("canvas")
  const scale = Math.min(1, 960 / Math.max(source.width, source.height))
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error(
      "Camera pixels are unavailable. Retry after connecting the camera."
    )
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const data = canvas.toDataURL("image/jpeg", 0.85)
  if (!data.startsWith("data:image/jpeg;base64,")) {
    throw new Error("Camera frame could not be read.")
  }
  return data.slice("data:image/jpeg;base64,".length)
}
export const requestVision: VisionTransport = async (request, signal) => {
  const response = await fetch("/api/viewer-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.any([signal, AbortSignal.timeout(22000)]),
  })
  const body: unknown = await response.json()
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Vision returned an invalid result. Retry Select.")
  }
  const result = body as VisionRecord
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Tracking unavailable. Retry Select."
    )
  }
  return result
}

export class ObjectTracking {
  private state = empty()
  private listeners = new Set<() => void>()
  private revision = 0
  private pending: Promise<void> | null = null
  private abort = new AbortController()
  private lastFrame = ""
  private readonly request: VisionTransport
  private readonly encode: (camera: ViewerCamera) => string
  private readonly now: () => number
  constructor(dependencies: TrackingDependencies = {}) {
    this.request = dependencies.request ?? requestVision
    this.encode = dependencies.encode ?? encodeFrame
    this.now = dependencies.now ?? (() => performance.now())
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private publish(state: ObjectTrackingSnapshot) {
    this.state = state
    this.listeners.forEach((listener) => listener())
  }
  private enqueue(work: () => Promise<void>) {
    const previous = this.pending
    const task = (async () => {
      if (previous) {
        await previous.catch(() => {})
      }
      await work()
    })()
    this.pending = task
    void task
      .finally(() => {
        if (this.pending === task) {
          this.pending = null
        }
      })
      .catch(() => {})
    return task
  }
  private cleanup(token: string) {
    return this.request({ action: "clear", token }, this.abort.signal)
      .then(() => {})
      .catch(() => {})
  }
  clear() {
    const token = this.state.reference?.token
    this.revision++
    this.lastFrame = ""
    this.publish(empty())
    if (token) {
      void this.enqueue(() => this.cleanup(token))
    }
  }
  async select(camera: ViewerCamera, choice: ObjectChoice) {
    this.clear()
    const revision = this.revision
    const source = camera.getSnapshot()
    if (!hasFreshFrame(source, this.now())) {
      this.publish({
        ...empty(),
        status: "error",
        error: "Wait for a fresh Scene frame before selecting.",
      })
      return
    }
    let image: string
    try {
      image = this.encode(camera)
    } catch (failure) {
      this.fail(
        failure instanceof DOMException && failure.name === "SecurityError"
          ? new Error(
              "This network stream blocks image analysis. Enable camera CORS or use USB."
            )
          : failure
      )
      return
    }
    const stamp = context(source)
    this.publish({ ...empty(), status: "selecting" })
    await this.enqueue(async () => {
      if (revision !== this.revision) {
        return
      }
      try {
        const result = await this.request(
          { action: "select", image, ...choice },
          this.abort.signal
        )
        const token = result.token
        if (
          typeof token !== "string" ||
          !token ||
          token.length > 64 ||
          !validObjectBox(result.box) ||
          typeof result.label !== "string"
        ) {
          throw new Error("Vision returned an invalid selection. Retry Select.")
        }
        if (
          revision !== this.revision ||
          !sameSource(stamp, camera.getSnapshot())
        ) {
          await this.cleanup(token)
          if (revision === this.revision) {
            this.clear()
          }
          return
        }
        this.publish({
          ...empty(),
          status: "searching",
          reference: {
            ...stamp,
            token,
            box: result.box,
            label: result.label.slice(0, 80),
          },
        })
      } catch (failure) {
        if (revision === this.revision) {
          this.fail(failure)
        }
      }
    })
  }
  async tick(scene: ViewerCamera, auxiliary: ViewerCamera) {
    const selected = this.state.reference
    if (!selected) {
      return
    }
    if (!sameSource(selected, scene.getSnapshot())) {
      this.clear()
      return
    }
    const source = auxiliary.getSnapshot()
    if (!hasFreshFrame(source, this.now())) {
      if (this.state.match || this.state.status === "matched") {
        this.publish({ ...this.state, status: "searching", match: null })
      }
      return
    }
    if (this.state.match && !sameSource(this.state.match, source)) {
      this.publish({ ...this.state, status: "searching", match: null })
    }
    if (this.pending || this.state.status === "error") {
      return
    }
    const frame = `${source.source!.key}:${source.frame!.generation}:${source.frame!.id}`
    if (frame === this.lastFrame) {
      return
    }
    this.lastFrame = frame
    const stamp = context(source)
    const revision = this.revision
    await this.enqueue(async () => {
      try {
        const image = this.encode(auxiliary)
        const result = await this.request(
          { action: "match", token: selected.token, image },
          this.abort.signal
        )
        if (
          revision !== this.revision ||
          !sameSource(stamp, auxiliary.getSnapshot()) ||
          !sameSource(selected, scene.getSnapshot())
        ) {
          return
        }
        if (
          !hasFreshFrame(auxiliary.getSnapshot(), this.now()) ||
          this.now() - stamp.timestamp > 500
        ) {
          this.publish({ ...this.state, status: "searching", match: null })
          return
        }
        if (result.status === "matched") {
          if (
            !validObjectBox(result.box) ||
            typeof result.score !== "number" ||
            !Number.isFinite(result.score) ||
            result.score <= 0.8 ||
            result.score > 1 ||
            typeof result.inliers !== "number" ||
            !Number.isInteger(result.inliers) ||
            result.inliers < 8
          ) {
            throw new Error("Vision could not verify this match. Retry Select.")
          }
          this.publish({
            ...this.state,
            status: "matched",
            error: "",
            match: { ...stamp, box: result.box, score: result.score },
          })
        } else if (
          result.status === "searching" ||
          result.status === "ambiguous"
        ) {
          this.publish({
            ...this.state,
            status: result.status,
            error: "",
            match: null,
          })
        } else {
          throw new Error("Vision returned an invalid match. Retry Select.")
        }
      } catch (failure) {
        if (
          revision === this.revision &&
          sameSource(stamp, auxiliary.getSnapshot()) &&
          sameSource(selected, scene.getSnapshot())
        ) {
          this.fail(failure)
        }
      }
    })
  }
  private fail(failure: unknown) {
    this.publish({
      ...this.state,
      status: "error",
      match: null,
      error:
        failure instanceof Error
          ? failure.message
          : "Tracking unavailable. Retry Select.",
    })
  }
}
