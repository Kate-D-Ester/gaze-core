import { expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type {
  RemoteObservation,
  RemoteRequest,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { RemoteEyeTrackingPage } =
  await import("../../apps/web/src/screens/remote-eye-tracking-page")

test("complete labeled calibration, validation, resize recovery, and camera-disconnection recovery", async () => {
  let clock = 100,
    id = 0,
    stopped = 0,
    ended: (() => void) | undefined
  const frames = new Map<number, FrameRequestCallback>()
  const originalNow = performance.now
  const originalRequest = globalThis.requestAnimationFrame,
    originalCancel = globalThis.cancelAnimationFrame
  const originalWorker = globalThis.Worker,
    originalCapture = globalThis.createImageBitmap
  const mediaDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices"
  )
  const secureDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "isSecureContext"
  )
  const originalPlay = HTMLVideoElement.prototype.play,
    originalPause = HTMLVideoElement.prototype.pause
  const sourceDescriptor = Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "srcObject"
  )
  const timeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "currentTime"
  )
  const widthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "videoWidth"
  )
  const readyDescriptor = Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "readyState"
  )
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const buttons = () => [...host.querySelectorAll("button")]
  const click = async (text: string) =>
    act(async () => {
      const button = buttons().find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent)?.includes(text)
      )
      expect(button).toBeDefined()
      expect(button!.disabled).toBe(false)
      button!.click()
    })
  try {
    performance.now = () => clock
    globalThis.requestAnimationFrame = (callback) => {
      frames.set(++id, callback)
      return id
    }
    globalThis.cancelAnimationFrame = (value) => {
      frames.delete(value)
    }
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => stopped++ }],
          getVideoTracks: () => [
            {
              addEventListener: (_event: string, cb: () => void) => {
                ended = cb
              },
            },
          ],
        }),
        enumerateDevices: async () => [],
      },
    })
    Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
      configurable: true,
      writable: true,
      value: null,
    })
    HTMLVideoElement.prototype.play = async () => {}
    HTMLVideoElement.prototype.pause = () => {}
    Object.defineProperty(HTMLVideoElement.prototype, "currentTime", {
      configurable: true,
      get: () => clock / 1000,
    })
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640,
    })
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      configurable: true,
      get: () => 4,
    })
    globalThis.createImageBitmap = (async () => ({
      close: () => {},
    })) as typeof createImageBitmap
    const makeObservation = (): RemoteObservation => {
      const dot = host.querySelector<HTMLDivElement>(".remote-target")
      const target = dot
        ? [parseFloat(dot.style.left) / 100, parseFloat(dot.style.top) / 100]
        : [0.5, 0.5]
      const head = Math.sin(clock / 230) * 0.05
      return {
        timestamp: clock,
        width: 640,
        height: 480,
        quality: 0.9,
        reason: null,
        feature: [
          (target[0]! - 0.5 - 0.25 * head) / 0.5,
          (target[1]! - 0.5) / 0.5,
          head,
        ],
        pose: {
          kind: "face",
          yaw: head,
          pitch: 0,
          roll: 0,
          x: 0.5 + head,
          y: 0.5,
          scale: 0.2,
        },
        eyes: [],
        faceBox: null,
        basePoint: null,
        method: "Simulated processor boundary",
        processingMs: 1,
      }
    }
    class TestWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror = null
      postMessage(request: RemoteRequest) {
        queueMicrotask(() =>
          this.onmessage?.({
            data:
              request.type === "init"
                ? { type: "ready", method: "test" }
                : { type: "result", observation: makeObservation() },
          } as MessageEvent)
        )
      }
      terminate() {
        this.onmessage = null
      }
    }
    globalThis.Worker = TestWorker as unknown as typeof Worker
    const tick = async () =>
      act(async () => {
        clock += 100
        const queued = [...frames]
        frames.clear()
        for (const [, cb] of queued) cb(clock)
        await Promise.resolve()
      })
    await act(async () =>
      root.render(
        createElement(RemoteEyeTrackingPage)
      )
    )
    await click("Webcam-based eye tracker")
    await click("Start camera")
    await tick()
    await click("Check your position")
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '.remote-page-heading button[aria-label="Previous step"]'
        )!
        .click()
    })
    expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
      "Camera"
    )
    expect(stopped).toBe(0)
    await click("Back to camera choices")
    expect(host.querySelectorAll(".remote-mode-card")).toHaveLength(3)
    expect(stopped).toBe(1)
    await click("Webcam-based eye tracker")
    await click("Start camera")
    await tick()
    await click("Check your position")
    await click("Continue to calibration")
    await act(async () => {
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    })
    await click("Start 9-target calibration")
    await click("Start calibration")
    for (let i = 0; i < 400 && host.querySelector(".remote-calibration"); i++)
      await tick()
    expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
      "Validation"
    )
    expect(host.textContent).toContain("162 synchronized samples")
    await click("Validate gaze")
    await click("Start validation")
    for (let i = 0; i < 250 && host.querySelector(".remote-calibration"); i++)
      await tick()
    expect(host.textContent).toContain("Mean target error")
    expect(host.textContent).toContain("5 targets")
    await click("Show live gaze")
    const originalLeft = parseFloat(
      host.querySelector<HTMLElement>(".remote-live-dot")!.style.left
    )
    const offsetInput = host.querySelector<HTMLInputElement>(
      '[aria-label="Gaze offset X (pixels)"]'
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(offsetInput, "20")
      offsetInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const adjustedLeft = parseFloat(
      host.querySelector<HTMLElement>(".remote-live-dot")!.style.left
    )
    expect(adjustedLeft - originalLeft).toBeCloseTo(
      (20 / window.innerWidth) * 100
    )
    expect(host.textContent).toContain("Previous accuracy check")
    await click("Reset gaze offset")
    expect(
      parseFloat(
        host.querySelector<HTMLElement>(".remote-live-dot")!.style.left
      )
    ).toBeCloseTo(originalLeft)
    expect(host.textContent).not.toContain("Previous accuracy check")
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
      "Calibration"
    )
    expect(host.textContent).not.toContain("Mean target error")
    expect(
      buttons().some((b) =>
        b.textContent?.includes("Start 9-target calibration")
      )
    ).toBe(true)
    await act(async () => ended?.())
    expect(host.textContent).toContain("Camera disconnected")
    expect(buttons().some((b) => b.textContent === "Start camera")).toBe(true)
    expect(stopped).toBe(2)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    performance.now = originalNow
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
    globalThis.Worker = originalWorker
    globalThis.createImageBitmap = originalCapture
    HTMLVideoElement.prototype.play = originalPlay
    HTMLVideoElement.prototype.pause = originalPause
    for (const [object, key, descriptor] of [
      [navigator, "mediaDevices", mediaDescriptor],
      [globalThis, "isSecureContext", secureDescriptor],
      [HTMLVideoElement.prototype, "srcObject", sourceDescriptor],
      [HTMLVideoElement.prototype, "currentTime", timeDescriptor],
      [HTMLVideoElement.prototype, "videoWidth", widthDescriptor],
      [HTMLVideoElement.prototype, "readyState", readyDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(object, key, descriptor)
      else Reflect.deleteProperty(object, key)
    }
  }
})
