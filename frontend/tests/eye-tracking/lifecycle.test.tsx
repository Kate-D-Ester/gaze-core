import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import {
  useTracker,
  type TrackerController,
} from "../../apps/web/src/features/eye-tracking/use-tracker"
GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let controller: TrackerController,
  root: Root,
  stopped: number,
  resolveCamera: (stream: any) => void,
  resolvePlay: () => void
function Harness() {
  controller = useTracker()
  return null
}
beforeEach(async () => {
  stopped = 0
  ;(globalThis as any).Worker = class {
    onmessage: any
    onerror: any
    postMessage() {}
    terminate() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () =>
        new Promise((resolve) => {
          resolveCamera = resolve
        }),
      enumerateDevices: async () => [],
    },
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 640,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 360,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
    configurable: true,
    writable: true,
    value: null,
  })
  HTMLVideoElement.prototype.play = () =>
    new Promise<void>((resolve) => {
      resolvePlay = resolve
    })
  HTMLVideoElement.prototype.pause = () => {}
  HTMLVideoElement.prototype.load = () => {}
  HTMLCanvasElement.prototype.getContext = (() => null) as any
  await act(async () => {
    root = createRoot(document.createElement("div"))
    root.render(createElement(Harness))
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
})
const stream = () => ({
  getTracks: () => [{ stop: () => stopped++ }],
  getVideoTracks: () => [{ label: "Test camera", addEventListener: () => {} }],
})
test("format change while permission is pending does not strand startup", async () => {
  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
  })
  await act(async () => controller.configure({ format: "classic" }))
  await act(async () => resolveCamera(stream()))
  // A configuration revision must not cancel source acquisition.
  expect(stopped).toBe(0)
  await act(async () => {
    resolvePlay()
    await pending!
  })
  expect(controller.busy).toBe(false)
  expect(controller.source?.kind).toBe("camera")
  expect(controller.settings.format).toBe("classic")
})
test("format change while video starts retains source and stop releases its tracks", async () => {
  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
  })
  await act(async () => resolveCamera(stream()))
  await act(async () => controller.configure({ format: "classic" }))
  expect(controller.error).toBe("")
  await act(async () => {
    resolvePlay()
    await pending!
  })
  expect(controller.source?.kind).toBe("camera")
  expect(controller.busy).toBe(false)
  await act(async () => controller.stop())
  expect(stopped).toBe(1)
})
test("stop disposes a late camera permission result without reactivating source", async () => {
  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
  })
  await act(async () => controller.stop())
  await act(async () => {
    resolveCamera(stream())
    await pending!
  })
  expect(stopped).toBe(1)
  expect(controller.source).toBeNull()
  expect(controller.busy).toBe(false)
})
test("source dimensions survive ROI invalidation before a new frame arrives", async () => {
  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
  })
  await act(async () => resolveCamera(stream()))
  await act(async () => {
    resolvePlay()
    await pending!
  })
  await act(async () =>
    controller.configure({ roi: { x: 10, y: 10, width: 300, height: 200 } })
  )
  expect((controller as any).dimensions).toEqual({ width: 640, height: 360 })
  expect(controller.frame).toBeNull()
})
