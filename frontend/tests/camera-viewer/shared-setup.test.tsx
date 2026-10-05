import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { Root } from "../../apps/web/node_modules/react-dom/client"
import type { WorkerResponse } from "../../apps/web/src/features/eye-tracking/tracker.worker.types"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { ThreeCameraWorkspace } =
  await import("../../apps/web/src/features/camera-viewer/three-camera-workspace")
let root: Root | null = null
let host: HTMLDivElement
let workers: FakeWorker[]
let stopped: number
let terminated: number
const originals = new Map<
  object,
  Map<PropertyKey, PropertyDescriptor | undefined>
>()
function replace(target: object, key: PropertyKey, value: PropertyDescriptor) {
  let entries = originals.get(target)
  if (!entries) {
    entries = new Map()
    originals.set(target, entries)
  }
  if (!entries.has(key)) {
    entries.set(key, Object.getOwnPropertyDescriptor(target, key))
  }
  Object.defineProperty(target, key, { configurable: true, ...value })
}
class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  constructor() {
    workers.push(this)
  }
  postMessage() {}
  terminate() {
    terminated++
  }
}
beforeEach(() => {
  localStorage.clear()
  workers = []
  stopped = 0
  terminated = 0
  replace(globalThis, "Worker", { value: FakeWorker, writable: true })
  replace(globalThis, "requestAnimationFrame", {
    value: () => 1,
    writable: true,
  })
  replace(globalThis, "cancelAnimationFrame", {
    value: () => {},
    writable: true,
  })
  replace(navigator, "mediaDevices", {
    value: {
      async enumerateDevices() {
        return []
      },
      addEventListener() {},
      removeEventListener() {},
      async getUserMedia() {
        return {
          getTracks: () => [
            {
              stop() {
                stopped++
              },
            },
          ],
          getVideoTracks: () => [
            {
              label: "Eye USB",
              getSettings: () => ({ deviceId: "eye-usb" }),
              addEventListener() {},
            },
          ],
        } as unknown as MediaStream
      },
    },
  })
  replace(HTMLVideoElement.prototype, "requestVideoFrameCallback", {
    value: () => 1,
  })
  replace(HTMLVideoElement.prototype, "cancelVideoFrameCallback", {
    value: () => {},
  })
  replace(HTMLVideoElement.prototype, "videoWidth", { get: () => 640 })
  replace(HTMLVideoElement.prototype, "videoHeight", { get: () => 480 })
  replace(HTMLVideoElement.prototype, "srcObject", {
    value: null,
    writable: true,
  })
  replace(HTMLVideoElement.prototype, "play", { value: async () => {} })
  replace(HTMLVideoElement.prototype, "pause", { value: () => {} })
  replace(HTMLVideoElement.prototype, "load", { value: () => {} })
  replace(HTMLCanvasElement.prototype, "getContext", { value: () => null })
})
afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount())
  }
  root = null
  host?.remove()
  for (const [target, entries] of originals) {
    for (const [key, descriptor] of entries) {
      if (descriptor) {
        Object.defineProperty(target, key, descriptor)
      } else {
        Reflect.deleteProperty(target, key)
      }
    }
  }
  originals.clear()
  localStorage.clear()
})
async function render(ready = true) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(createElement(ThreeCameraWorkspace))
  })
  if (!ready) {
    return
  }
  await act(async () =>
    workers[0]!.onmessage?.({
      data: { type: "ready" },
    } as MessageEvent<WorkerResponse>)
  )
}
async function click(text: string) {
  const button = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find(
    (element) =>
      element.textContent?.trim() === text && !element.closest("[hidden]")
  )
  expect(button).toBeDefined()
  expect(button!.disabled).toBe(false)
  await act(async () => button!.click())
}
test("setup returns the same locked eye model and source to the viewer without a second worker or USB request", async () => {
  await render()
  await click("Gaze setup")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Eye Tracker 1: Manual tracking"]'
      )!
      .click()
  )
  await click("Connect")
  expect(
    Array.from(host.querySelectorAll("[role=alert]")).map(
      (item) => item.textContent
    )
  ).toEqual([])
  await click("Continue")
  await click("Continue")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Reset corners to the eye region"]'
      )!
      .click()
  )
  await click("Lock model")
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain(
    "Scene camera"
  )
  await click("Use in viewer")
  expect(
    host
      .querySelector('[aria-label="Eye camera disconnect"]')
      ?.hasAttribute("disabled")
  ).toBe(false)
  expect(host.textContent).toContain("Eye model ready · Calibrate scene")
  expect(stopped).toBe(0)
  expect(terminated).toBe(0)
  expect(workers).toHaveLength(1)
  await click("Gaze setup")
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain(
    "Scene camera"
  )
  await click("Use in viewer")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Eye camera disconnect"]')!
      .click()
  )
  expect(stopped).toBe(1)
  expect(host.textContent).toContain("Eye setup needed")
  expect(workers).toHaveLength(1)
})
test("saved setup sources and orientation load into the viewer without automatically connecting", async () => {
  localStorage.setItem(
    "gazecore.scene-eye-camera.source.v1",
    JSON.stringify({
      kind: "network",
      url: "http://eye.local/stream",
      deviceId: "",
    })
  )
  localStorage.setItem(
    "gazecore.scene-camera.source.v1",
    JSON.stringify({
      kind: "network",
      url: "http://scene.local/stream",
      deviceId: "",
    })
  )
  localStorage.setItem(
    "gazecore.eye-camera.transform.v1",
    JSON.stringify({ rotation: 90, mirrorX: true, mirrorY: false })
  )
  await render()
  expect(
    host.querySelector<HTMLInputElement>(
      '[aria-label="Eye camera network URL"]'
    )?.value
  ).toBe("http://eye.local/stream")
  expect(
    host.querySelector<HTMLInputElement>(
      '[aria-label="Scene camera network URL"]'
    )?.value
  ).toBe("http://scene.local/stream")
  expect(
    host.querySelectorAll('[aria-label$=" disconnect"]:disabled')
  ).toHaveLength(3)
  expect(stopped).toBe(0)
  await click("Gaze setup")
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Network stream URL"]')
      ?.value
  ).toBe("http://eye.local/stream")
  expect(workers).toHaveLength(1)
})

test("viewer eye connection requires the worker's ready event and remains blocked after failure", async () => {
  await render(false)
  const eyeForm = host.querySelector<HTMLFormElement>(
    '[aria-label="Eye camera source"]'
  )!
  expect(eyeForm.querySelector("fieldset")!.disabled).toBe(true)
  await act(async () =>
    workers[0]!.onmessage?.({
      data: { type: "ready" },
    } as MessageEvent<WorkerResponse>)
  )
  expect(eyeForm.querySelector("fieldset")!.disabled).toBe(false)
  await act(async () =>
    workers[0]!.onmessage?.({
      data: { type: "error", message: "Engine failed" },
    } as MessageEvent<WorkerResponse>)
  )
  expect(eyeForm.querySelector("fieldset")!.disabled).toBe(true)
  expect(host.textContent).toContain("Engine failed")
})
function stream(): MediaStream {
  return {
    getTracks: () => [
      {
        stop() {
          stopped++
        },
      },
    ],
    getVideoTracks: () => [
      {
        label: "Eye USB",
        getSettings: () => ({ deviceId: "eye-usb" }),
        addEventListener() {},
      },
    ],
  } as unknown as MediaStream
}
test("deferred USB allocation blocks both view switches and setup navigation until it finishes", async () => {
  let release!: (stream: MediaStream) => void
  navigator.mediaDevices.getUserMedia = () =>
    new Promise((resolve) => {
      release = resolve
    })
  await render()
  await act(async () =>
    host
      .querySelector<HTMLFormElement>('[aria-label="Eye camera source"]')!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  )
  const gazeSetup = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent === "Gaze setup")!
  expect(gazeSetup.disabled).toBe(true)
  await act(async () => release(stream()))
  expect(gazeSetup.disabled).toBe(false)
  await click("Gaze setup")
  await click("Reconnect")
  const returnButton = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent === "Use in viewer")!
  expect(returnButton.disabled).toBe(true)
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Eye Tracker 1: Manual tracking"]'
    )!.disabled
  ).toBe(true)
  expect(
    Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Setup steps"] button'
      )
    )
      .filter((button) => button.getAttribute("aria-current") !== "step")
      .every((button) => button.disabled)
  ).toBe(true)
  await act(async () => release(stream()))
  expect(returnButton.disabled).toBe(false)
})
test("eye setup rejects the USB device already used by the auxiliary feed", async () => {
  await render()
  await act(async () =>
    host
      .querySelector<HTMLFormElement>('[aria-label="Target camera source"]')!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  )
  await click("Gaze setup")
  await click("Connect")
  expect(host.textContent).toContain(
    "Choose different USB devices for each camera"
  )
  expect(stopped).toBe(1)
  await click("Use in viewer")
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Target camera disconnect"]'
    )!.disabled
  ).toBe(false)
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Eye camera disconnect"]'
    )!.disabled
  ).toBe(true)
})

test("pending scene allocation blocks footer Back and cannot expose eye connection controls", async () => {
  await render()
  await click("Gaze setup")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Eye Tracker 1: Manual tracking"]'
      )!
      .click()
  )
  await click("Connect")
  await click("Continue")
  await click("Continue")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Reset corners to the eye region"]'
      )!
      .click()
  )
  await click("Lock model")
  let release!: (stream: MediaStream) => void
  navigator.mediaDevices.getUserMedia = () =>
    new Promise((resolve) => {
      release = resolve
    })
  await click("Connect")
  const back = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent?.trim() === "Back")!
  expect(back.disabled).toBe(true)
  await act(async () => {
    back.click()
    back.click()
    back.click()
  })
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain(
    "Scene camera"
  )
  const returnButton = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find((button) => button.textContent === "Use in viewer")!
  expect(returnButton.disabled).toBe(true)
  await act(async () => release(stream()))
  expect(host.textContent).toContain("Choose a different USB device")
  expect(back.disabled).toBe(false)
})

test.each(["orientation", "source", "dimensions"])(
  "calibration survives setup and dropped frames but a changed scene %s invalidates it",
  async (change) => {
    const { ViewerSession } =
      await import("../../apps/web/src/features/camera-viewer/three-camera-workspace")
    const { SceneCamera } =
      await import("../../apps/web/src/features/scene-eye-tracking/scene-camera")
    const { saveSceneProfile } =
      await import("../../apps/web/src/features/scene-eye-tracking/calibration-profiles")
    const { calibrate } = await import("../scene-eye-tracking/fixtures")
    const { createViewerTracker } = await import("./fixtures")
    const tracker = createViewerTracker()
    tracker.settings = {
      ...tracker.settings,
      format: "classic",
      corners: [
        [100, 240],
        [540, 240],
      ],
    }
    const scene = new SceneCamera()
    scene.rawCanvas.width = 640
    scene.rawCanvas.height = 480
    const auxiliary = new SceneCamera()
    const listeners = new Set<() => void>()
    let snapshot: import("../../apps/web/src/features/scene-eye-tracking/scene-camera.types").SceneCameraSnapshot =
      {
        ...scene.getSnapshot(),
        connection: "live" as const,
        source: {
          kind: "camera" as const,
          name: "Scene",
          key: "scene:1",
          deviceId: "scene-usb",
        },
        frame: {
          id: 1,
          timestamp: performance.now(),
          width: 640,
          height: 480,
          generation: 1,
        },
      }
    scene.latest = snapshot.frame
    scene.getSnapshot = () => snapshot
    scene.subscribe = (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
    scene.setTransform = (transform) => {
      snapshot = { ...snapshot, transform }
      listeners.forEach((listener) => listener())
    }
    const calibrated = calibrate().s.getSnapshot()
    saveSceneProfile(
      "Saved headset",
      {
        calibration: calibrated.calibration!,
        method: calibrated.method,
        offset: [0.02, -0.03],
        delayMs: 30,
      },
      {
        trackerFormat: "classic",
        orientation: { eye: tracker.transform, scene: snapshot.transform },
      }
    )
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root!.render(
        createElement(ViewerSession, {
          tracker,
          sceneCamera: scene,
          auxiliaryCamera: auxiliary,
        })
      )
    )
    await click("Gaze setup")
    const calibrationStep = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Setup steps"] button'
      )
    ).find((button) => button.textContent?.includes("Calibration"))!
    await act(async () => calibrationStep.click())
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain(
      "Live scene gaze"
    )
    await click("Use in viewer")
    expect(host.textContent).toContain("Calibration loaded")
    await click("Gaze setup")
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain(
      "Live scene gaze"
    )
    await click("Use in viewer")
    expect(host.textContent).toContain("Calibration loaded")
    const liveFrame = snapshot.frame!
    await act(async () => {
      scene.latest = null
      snapshot = { ...snapshot, frame: null, connection: "reconnecting" }
      listeners.forEach((listener) => listener())
    })
    expect(host.textContent).toContain("Reconnect cameras")
    await act(async () => {
      snapshot = {
        ...snapshot,
        frame: { ...liveFrame, id: 2, timestamp: performance.now() },
        connection: "live",
      }
      scene.latest = snapshot.frame
      listeners.forEach((listener) => listener())
    })
    expect(host.textContent).toContain("Calibration loaded")
    await act(async () =>
      root!.render(
        createElement(ViewerSession, {
          tracker: { ...tracker, frame: null, connection: "reconnecting" },
          sceneCamera: scene,
          auxiliaryCamera: auxiliary,
        })
      )
    )
    expect(host.textContent).toContain("Reconnect cameras")
    await act(async () =>
      root!.render(
        createElement(ViewerSession, {
          tracker,
          sceneCamera: scene,
          auxiliaryCamera: auxiliary,
        })
      )
    )
    expect(host.textContent).toContain("Calibration loaded")
    await act(async () => {
      if (change === "orientation") {
        scene.setTransform({ rotation: 90, mirrorX: false, mirrorY: false })
      } else {
        if (change === "source")
          snapshot = {
            ...snapshot,
            source: { ...snapshot.source!, key: "scene:2" },
          }
        if (change === "dimensions") {
          scene.rawCanvas.width = 800
          snapshot = { ...snapshot, frame: { ...snapshot.frame!, width: 800 } }
        }
        listeners.forEach((listener) => listener())
      }
    })
    expect(host.textContent).not.toContain("Calibration loaded")
    expect(host.textContent).toContain("Eye model ready · Calibrate scene")
    expect(tracker.settings.locked).toBe(true)
  }
)
