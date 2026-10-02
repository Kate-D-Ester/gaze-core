import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { HeadCamera } from "../../apps/web/src/features/eye-tracking/head-tracking/head-camera"
import type { HeadCameraState } from "../../apps/web/src/features/eye-tracking/head-tracking/head-camera.types"
import type {
  HeadWorkerRequest,
  HeadWorkerResponse,
} from "../../apps/web/src/features/eye-tracking/head-tracking/head.worker.types"
import { act, createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { useHeadTracking } from "../../apps/web/src/features/eye-tracking/head-tracking/use-head-tracking"
import type { HeadTrackingController } from "../../apps/web/src/features/eye-tracking/head-tracking/use-head-tracking.types"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
})

class WorkerDouble {
  onerror = () => {}
  onmessage = (_event: MessageEvent<HeadWorkerResponse>) => {}
  requests: HeadWorkerRequest[] = []
  terminate = mock(() => {})
  postMessage(message: HeadWorkerRequest) {
    this.requests.push(message)
  }
  respond(message: HeadWorkerResponse) {
    this.onmessage({ data: message } as MessageEvent<HeadWorkerResponse>)
  }
}

let camera: HeadCamera
let states: HeadCameraState[] = []
let workers: WorkerDouble[] = []
let now = 0
const scheduler = { tick: () => {} }
const originalWorker = globalThis.Worker
const originalCanvas = globalThis.OffscreenCanvas
const originalBitmap = globalThis.createImageBitmap
const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices"
)
const originalVideoProperties = Object.getOwnPropertyDescriptors(
  HTMLVideoElement.prototype
)
const track = { stop: mock(() => {}), addEventListener: mock(() => {}) }
const stream = {
  getTracks: () => [track],
  getVideoTracks: () => [track],
} as unknown as MediaStream

beforeEach(() => {
  states = []
  workers = []
  now = 0
  track.stop.mockClear()
  camera = new HeadCamera({ onState: (state) => states.push(state) })
  globalThis.Worker = class extends WorkerDouble {
    constructor() {
      super()
      workers.push(this)
    }
  } as unknown as typeof Worker
  globalThis.OffscreenCanvas = class {} as unknown as typeof OffscreenCanvas
  globalThis.createImageBitmap = async () => ({ close() {} }) as ImageBitmap
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => stream },
  })
  for (const [name, value] of Object.entries({
    videoWidth: 640,
    videoHeight: 480,
    readyState: 2,
  })) {
    Object.defineProperty(HTMLVideoElement.prototype, name, {
      configurable: true,
      get: () => value,
    })
  }
  HTMLVideoElement.prototype.play = async () => {}
  HTMLVideoElement.prototype.pause = () => {}
  Object.defineProperty(HTMLVideoElement.prototype, "currentTime", {
    configurable: true,
    get: () => now / 1000,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
    configurable: true,
    writable: true,
    value: null,
  })
  spyOn(performance, "now").mockImplementation(() => now)
  spyOn(globalThis, "setInterval").mockImplementation((callback) => {
    scheduler.tick = callback as () => void
    return 1 as unknown as ReturnType<typeof setInterval>
  })
})

afterEach(() => {
  camera.stop()
  mock.restore()
  globalThis.Worker = originalWorker
  globalThis.OffscreenCanvas = originalCanvas
  globalThis.createImageBitmap = originalBitmap
  if (originalMediaDevices)
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevices)
  for (const [name, descriptor] of Object.entries(originalVideoProperties)) {
    Object.defineProperty(HTMLVideoElement.prototype, name, descriptor)
  }
})

test("stopping while camera permission is pending releases the late stream", async () => {
  const permission = Promise.withResolvers<MediaStream>()
  navigator.mediaDevices.getUserMedia = () => permission.promise
  const pending = camera.start("front-camera")
  camera.stop()
  permission.resolve(stream)
  await pending
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(workers).toHaveLength(0)
  expect(states.at(-1)?.status).toBe("off")
})

test("orientation changes discard the old pose and are sent with the next camera frame", async () => {
  await camera.start("front-camera")
  const worker = workers[0]
  worker.respond({ type: "ready" })
  now = 100
  scheduler.tick()
  await Promise.resolve()
  camera.setTransform({ rotation: 90, mirrorX: true, mirrorY: false })
  worker.respond({
    type: "pose",
    pose: { id: 1, timestamp: 100, position: [0, 0, -50], rotation: [0, 0, 0] },
  })
  expect(states.at(-1)?.pose).toBeNull()
  now = 200
  scheduler.tick()
  await Promise.resolve()
  const request = worker.requests.at(-1)
  expect(request?.type).toBe("frame")
  if (request?.type === "frame") {
    expect(request.transform).toEqual({
      rotation: 90,
      mirrorX: true,
      mirrorY: false,
    })
  }
})

test("stopping during video startup cannot reactivate the worker", async () => {
  const playback = Promise.withResolvers<void>()
  HTMLVideoElement.prototype.play = () => playback.promise
  const pending = camera.start("front-camera")
  await Promise.resolve()
  camera.stop()
  playback.resolve()
  await pending
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(workers).toHaveLength(0)
})

test("one worker request stays in flight and stop closes a late bitmap", async () => {
  const bitmap = Promise.withResolvers<ImageBitmap>()
  globalThis.createImageBitmap = () => bitmap.promise
  await camera.start("front-camera")
  expect(states.at(-1)?.error).toBe("")
  const worker = workers[0]
  worker.respond({ type: "ready" })
  scheduler.tick()
  scheduler.tick()
  expect(
    worker.requests.filter((request) => request.type === "frame")
  ).toHaveLength(0)
  const close = mock(() => {})
  camera.stop()
  bitmap.resolve({ close } as unknown as ImageBitmap)
  await Promise.resolve()
  expect(close).toHaveBeenCalledTimes(1)
  expect(worker.terminate).toHaveBeenCalledTimes(1)
  expect(states.at(-1)?.pose).toBeNull()
})

test("stalled camera video expires the last face pose", async () => {
  await camera.start("front-camera")
  const worker = workers[0]
  worker.respond({ type: "ready" })
  worker.respond({
    type: "pose",
    pose: { id: 1, timestamp: 0, position: [0, 0, -60], rotation: [0, 0, 0] },
  })
  expect(states.at(-1)?.status).toBe("tracking")
  now = 1000
  scheduler.tick()
  await Promise.resolve()
  expect(states.at(-1)?.status).toBe("lost")
  expect(states.at(-1)?.pose).toBeNull()
})

test("a worker failure releases camera resources and ignores later messages", async () => {
  await camera.start("front-camera")
  const worker = workers[0]
  worker.respond({ type: "error", message: "Runtime unavailable" })
  worker.respond({ type: "ready" })
  expect(states.at(-1)?.status).toBe("error")
  expect(states.at(-1)?.error).toBe("Runtime unavailable")
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(worker.terminate).toHaveBeenCalledTimes(1)
})

test("a queued callback from the previous camera cannot submit to its replacement", async () => {
  await camera.start("first-camera")
  workers[0].respond({ type: "ready" })
  const oldTick = scheduler.tick
  camera.stop()
  await camera.start("replacement-camera")
  oldTick()
  await Promise.resolve()
  expect(workers[1].requests.map((request) => request.type)).toEqual([
    "initialize",
  ])
  workers[1].respond({ type: "ready" })
  now = 100
  scheduler.tick()
  await Promise.resolve()
  expect(
    workers[1].requests.filter((request) => request.type === "frame")
  ).toHaveLength(1)
})

test("losing the eye source stops the front camera and clears its last pose", async () => {
  let eyeAvailable = true
  let controller: HeadTrackingController
  function Harness() {
    controller = useHeadTracking(eyeAvailable)
    return null
  }
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(Harness)))
    await act(async () => controller.start("front-camera"))
    expect(controller.enabled).toBe(true)
    eyeAvailable = false
    await act(async () => root.render(createElement(Harness)))
    expect(controller.enabled).toBe(false)
    expect(controller.latest.current).toBeNull()
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(workers[0].terminate).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
  }
})
