import { expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { RemoteRequest } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { RemoteEyeTrackingPage } =
  await import("../../apps/web/src/screens/remote-eye-tracking-page")

test("the recording picker opens local inspection without camera permission or screen calibration", async () => {
  const originals = {
    worker: globalThis.Worker,
    capture: globalThis.createImageBitmap,
    play: HTMLVideoElement.prototype.play,
    pause: HTMLVideoElement.prototype.pause,
    load: HTMLVideoElement.prototype.load,
    createUrl: URL.createObjectURL,
    revokeUrl: URL.revokeObjectURL,
    requestFrame: globalThis.requestAnimationFrame,
    cancelFrame: globalThis.cancelAnimationFrame,
  }
  const descriptors = [
    [
      navigator,
      "mediaDevices",
      Object.getOwnPropertyDescriptor(navigator, "mediaDevices"),
    ],
    [
      globalThis,
      "isSecureContext",
      Object.getOwnPropertyDescriptor(globalThis, "isSecureContext"),
    ],
    [
      HTMLVideoElement.prototype,
      "readyState",
      Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "readyState"),
    ],
    [
      HTMLVideoElement.prototype,
      "videoWidth",
      Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoWidth"),
    ],
    [
      HTMLVideoElement.prototype,
      "videoHeight",
      Object.getOwnPropertyDescriptor(
        HTMLVideoElement.prototype,
        "videoHeight"
      ),
    ],
  ] as const
  let permissions = 0
  const revoked: string[] = []
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let activeWorker: TestWorker | undefined
  class TestWorker {
    constructor() {
      activeWorker = this
    }
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror = null
    postMessage(request: RemoteRequest) {
      if (request.type === "init")
        queueMicrotask(() =>
          this.onmessage?.({
            data: { type: "ready", method: "inspection" },
          } as MessageEvent)
        )
    }
    terminate() {
      this.onmessage = null
    }
  }
  try {
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [],
        getUserMedia: async () => {
          permissions++
          throw new Error("Replay must not request a camera")
        },
      },
    })
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      configurable: true,
      get: () => 4,
    })
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640,
    })
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 480,
    })
    globalThis.createImageBitmap = (async () => ({
      close: () => {},
    })) as typeof createImageBitmap
    globalThis.Worker = TestWorker as unknown as typeof Worker
    globalThis.requestAnimationFrame = () => 1
    globalThis.cancelAnimationFrame = () => {}
    HTMLVideoElement.prototype.play = async () => {}
    HTMLVideoElement.prototype.pause = () => {}
    HTMLVideoElement.prototype.load = () => {}
    URL.createObjectURL = () => "blob:private-video"
    URL.revokeObjectURL = (url) => revoked.push(url)
    await act(async () =>
      root.render(
        createElement(RemoteEyeTrackingPage)
      )
    )
    await act(async () =>
      host.querySelectorAll<HTMLButtonElement>(".remote-mode-card")[2]!.click()
    )
    const picker = host.querySelector<HTMLInputElement>('input[type="file"]')
    expect(picker).not.toBeNull()
    Object.defineProperty(picker!, "files", {
      configurable: true,
      value: [new File(["video"], "recording.mp4", { type: "video/mp4" })],
    })
    await act(async () =>
      picker!.dispatchEvent(new Event("change", { bubbles: true }))
    )
    await act(async () =>
      activeWorker!.onmessage?.({
        data: {
          type: "result",
          observation: {
            timestamp: performance.now(),
            width: 640,
            height: 480,
            quality: 0.9,
            reason: null,
            feature: [0.5],
            eyes: [],
            faceBox: null,
            basePoint: null,
            pose: {
              kind: "face",
              yaw: 0,
              pitch: 0,
              roll: 0,
              x: 0.5,
              y: 0.5,
              scale: 0.2,
            },
            method: "inspection",
            processingMs: 1,
          },
        },
      } as MessageEvent)
    )
    expect(host.querySelector(".remote-check .status-light.on")).not.toBeNull()
    const video = host.querySelector("video")!
    expect(permissions).toBe(0)
    expect(video.src).toBe("blob:private-video")
    expect(video.controls).toBe(true)
    expect(
      host.querySelector(".remote-preview")?.classList.contains("mirrored")
    ).toBe(false)
    const calibrate = host.querySelector<HTMLButtonElement>(
      '[aria-label="Continue to calibration"]'
    )
    expect(calibrate?.disabled).toBe(true)
    await act(async () => calibrate!.click())
    expect(host.querySelector(".remote-calibration")).toBeNull()
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="Continue to calibration"]'
      )?.disabled
    ).toBe(true)
    await act(async () => root.unmount())
    expect(revoked).toEqual(["blob:private-video"])
  } finally {
    await act(async () => root.unmount())
    host.remove()
    globalThis.Worker = originals.worker
    globalThis.createImageBitmap = originals.capture
    globalThis.requestAnimationFrame = originals.requestFrame
    globalThis.cancelAnimationFrame = originals.cancelFrame
    HTMLVideoElement.prototype.play = originals.play
    HTMLVideoElement.prototype.pause = originals.pause
    HTMLVideoElement.prototype.load = originals.load
    URL.createObjectURL = originals.createUrl
    URL.revokeObjectURL = originals.revokeUrl
    for (const [object, key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(object, key, descriptor)
      else Reflect.deleteProperty(object, key)
    }
  }
})
