import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import type { Root } from "../../apps/web/node_modules/react-dom/client"
import { useTracker } from "../../apps/web/src/features/eye-tracking/use-tracker"
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"
import { RegionControls } from "../../apps/web/src/features/eye-tracking/steps/region-controls"
import { SourceControls } from "../../apps/web/src/features/eye-tracking/steps/source-controls"
import { EyeTrackingWorkspace } from "../../apps/web/src/screens/eye-tracking-workspace"
import type { WorkerRequest } from "../../apps/web/src/features/eye-tracking/tracker.worker.types"
import {
  getCameraErrorMessage,
  getVideoErrorMessage,
} from "../../apps/web/src/features/eye-tracking/video-source"
GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
let controller: TrackerController,
  root: Root | null,
  host: HTMLDivElement,
  stopped: number,
  resolveCamera: (stream: any) => void,
  rejectCamera: (reason: unknown) => void,
  resolvePlay: () => void,
  availableDevices: MediaDeviceInfo[],
  deviceChangeListener: (() => void) | null,
  enumerateCalls: number,
  workers: {
    onmessage: any
    postMessage: (request: WorkerRequest) => void
    terminate: () => void
  }[],
  terminatedWorkers: number
function Harness() {
  controller = useTracker()
  return null
}
beforeEach(async () => {
  localStorage.clear()
  stopped = 0
  terminatedWorkers = 0
  workers = []
  enumerateCalls = 0
  availableDevices = [
    { kind: "videoinput", deviceId: "camera-1", label: "" } as MediaDeviceInfo,
  ]
  deviceChangeListener = null
  ;(globalThis as any).Worker = class {
    onmessage: any
    onerror: any
    constructor() {
      workers.push(this)
    }
    postMessage() {}
    terminate() {
      terminatedWorkers += 1
    }
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () =>
        new Promise((resolve, reject) => {
          resolveCamera = resolve
          rejectCamera = reject
        }),
      enumerateDevices: async () => {
        enumerateCalls++
        return availableDevices
      },
      addEventListener: (type: string, listener: () => void) => {
        if (type === "devicechange") deviceChangeListener = listener
      },
      removeEventListener: (type: string, listener: () => void) => {
        if (type === "devicechange" && deviceChangeListener === listener)
          deviceChangeListener = null
      },
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
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    root.render(createElement(Harness))
  })
})
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  host.remove()
})
const stream = () => ({
  getTracks: () => [{ stop: () => stopped++ }],
  getVideoTracks: () => [
    {
      label: "Test camera",
      getSettings: () => ({ deviceId: "camera-1" }),
      addEventListener: () => {},
    },
  ],
})

test.each([false, true])(
  "manual model locks without a new worker frame (scene mode: %s)",
  async (sceneMode) => {
    const eyeWorkerIndex = workers.length
    await act(async () =>
      root?.render(createElement(EyeTrackingWorkspace, { sceneMode }))
    )
    await act(async () =>
      workers[eyeWorkerIndex].onmessage({ data: { type: "ready" } })
    )
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Eye Tracker 1: Manual tracking"]'
        )!
        .click()
    })
    const clickButton = async (label: string) => {
      const button = Array.from(host.querySelectorAll("button")).find(
        (item) =>
          item.textContent?.trim() === label && !item.closest("[hidden]")
      )
      expect(button).toBeDefined()
      expect(button!.disabled).toBe(false)
      await act(async () => button!.click())
    }
    await clickButton("Connect")
    await act(async () => resolveCamera(stream()))
    await act(async () => resolvePlay())
    await clickButton("Continue")
    await clickButton("Continue")
    const lock = Array.from(host.querySelectorAll("button")).find(
      (item) => item.textContent?.trim() === "Lock model"
    )!
    expect(lock.disabled).toBe(true)
    expect(host.textContent).toContain("Place two separate eye corners")
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Reset corners to the eye region"]'
        )!
        .click()
    })
    await clickButton("Lock model")
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain(
      sceneMode ? "Scene camera" : "Head tracker"
    )
  }
)

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
  expect(controller.source?.deviceId).toBe("camera-1")
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
test("eye orientation resets coordinate-dependent setup and fits portrait frames", async () => {
  await act(async () => controller.startSample())
  await act(async () =>
    controller.configure(
      {
        roi: { x: 20, y: 20, width: 100, height: 100 },
        corners: [
          [30, 30],
          [60, 60],
        ],
        locked: true,
      },
      false
    )
  )
  await act(async () =>
    controller.setTransform({ rotation: 90, mirrorX: true, mirrorY: false })
  )
  expect(controller.dimensions).toEqual({ width: 360, height: 480 })
  expect(controller.settings.roi).toEqual({
    x: 0,
    y: 0,
    width: 360,
    height: 480,
  })
  expect(controller.settings.corners).toBeNull()
  expect(controller.settings.locked).toBe(false)
  expect(controller.transform.rotation).toBe(90)
  expect(controller.source?.kind).toBe("sample")
  expect(controller.frame).toBeNull()
})

test("settings edits and source restarts cannot queue frames behind an active worker request", async () => {
  await act(async () => root?.unmount())
  root = null
  let tick: FrameRequestCallback = () => {},
    requests: WorkerRequest[] = []
  globalThis.requestAnimationFrame = (callback) => {
    tick = callback
    return 1
  }
  const context = {
    clearRect() {},
    fillRect() {},
    beginPath() {},
    ellipse() {},
    arc() {},
    fill() {},
    stroke() {},
    getImageData: () => ({ data: new Uint8ClampedArray(640 * 480 * 4) }),
  }
  HTMLCanvasElement.prototype.getContext = (() => context) as any
  await act(async () => {
    root = createRoot(host)
    root.render(createElement(Harness))
  })
  const worker = workers.at(-1)!
  worker.postMessage = (request) => requests.push(request)
  controller.sourceCanvas.current = document.createElement("canvas")
  await act(async () => {
    worker.onmessage({ data: { type: "ready" } })
    controller.startSample()
    tick(100)
  })
  expect(requests).toHaveLength(1)
  await act(async () => {
    controller.configure({ threshold: 5 })
    tick(200)
    controller.configure({ threshold: 10 })
    tick(300)
  })
  expect(requests).toHaveLength(1)
  await act(async () => {
    worker.onmessage({
      data: {
        type: "error",
        generation: requests[0].generation,
        message: "stale",
      },
    })
    tick(400)
  })
  expect(controller.error).toBe("")
  expect(requests).toHaveLength(2)
  expect(requests[1].settings.threshold).toBe(10)
  await act(async () => {
    controller.stop()
    controller.startSample()
    tick(500)
  })
  expect(requests).toHaveLength(2)
  await act(async () => {
    worker.onmessage({
      data: {
        type: "error",
        generation: requests[1].generation,
        message: "stale",
      },
    })
    tick(600)
  })
  expect(controller.error).toBe("")
  expect(requests).toHaveLength(3)
})

test("tracker restores ROI, manual corners, and threshold preferences after remount", async () => {
  await act(async () =>
    controller.configure({
      roi: { x: 64, y: 48, width: 320, height: 240 },
      corners: [
        [120, 150],
        [480, 310],
      ],
      threshold: 137,
      thresholdMode: "manual",
    })
  )
  await act(async () => root?.unmount())
  root = null

  await act(async () => {
    root = createRoot(host)
    root.render(createElement(Harness))
  })

  expect(controller.settings.roi).toEqual({
    x: 64,
    y: 48,
    width: 320,
    height: 240,
  })
  expect(controller.settings.corners).toEqual([
    [120, 150],
    [480, 310],
  ])
  expect(controller.settings.threshold).toBe(137)
  expect(controller.settings.thresholdMode).toBe("manual")
})

test("tracker keeps separate saved settings for each tracker format", async () => {
  await act(async () =>
    controller.configure({
      roi: { x: 40, y: 30, width: 400, height: 300 },
      threshold: -18,
      thresholdMode: "auto",
    })
  )
  await act(async () => controller.configure({ format: "classic" }))
  await act(async () =>
    controller.configure({
      corners: [
        [110, 120],
        [510, 340],
      ],
      threshold: 122,
    })
  )

  await act(async () => controller.configure({ format: "spatial" }))

  expect(controller.settings.roi).toEqual({
    x: 40,
    y: 30,
    width: 400,
    height: 300,
  })
  expect(controller.settings.threshold).toBe(-18)
  expect(controller.settings.thresholdMode).toBe("auto")
  await act(async () => controller.configure({ format: "classic" }))
  expect(controller.settings.threshold).toBe(122)
  expect(controller.settings.corners).toEqual([
    [110, 120],
    [510, 340],
  ])
})

test("saved camera coordinates scale to the active camera dimensions", async () => {
  await act(async () =>
    controller.configure({
      roi: { x: 64, y: 48, width: 320, height: 240 },
      corners: [
        [100, 100],
        [500, 300],
      ],
    })
  )
  await act(async () => root?.unmount())
  root = null
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 1280,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 720,
  })
  await act(async () => {
    root = createRoot(host)
    root.render(createElement(Harness))
  })

  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
  })
  await act(async () => resolveCamera(stream()))
  await act(async () => {
    resolvePlay()
    await pending!
  })

  expect(controller.settings.roi).toEqual({
    x: 64,
    y: 36,
    width: 320,
    height: 180,
  })
  expect(controller.settings.corners).toEqual([
    [100, 75],
    [500, 225],
  ])
})

test("high-resolution camera frames fit the processing limit without distortion", async () => {
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 1920,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 1080,
  })
  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
  })
  await act(async () => resolveCamera(stream()))
  await act(async () => {
    resolvePlay()
    await pending!
  })
  expect(controller.dimensions).toEqual({ width: 640, height: 360 })
})

test("enumerates USB cameras on mount and refreshes the list when devices change", async () => {
  await act(async () => Promise.resolve())
  expect(enumerateCalls).toBeGreaterThan(0)
  expect(controller.devices.map((device) => device.deviceId)).toEqual([
    "camera-1",
  ])

  availableDevices = [
    ...availableDevices,
    {
      kind: "videoinput",
      deviceId: "camera-2",
      label: "Webcam",
    } as MediaDeviceInfo,
  ]
  await act(async () => deviceChangeListener?.())
  expect(controller.devices.map((device) => device.deviceId)).toEqual([
    "camera-1",
    "camera-2",
  ])
})

test("source controls show numbered USB cameras and only USB or network modes", async () => {
  await act(async () => Promise.resolve())
  await act(async () =>
    root.render(
      createElement(SourceControls, {
        tracker: controller,
        resetSource: () => {},
      })
    )
  )
  const labels = Array.from(document.querySelectorAll("option"), (option) =>
    option.textContent?.trim()
  )
  const text = document.body.textContent ?? ""
  expect(labels).toContain("Camera 1")
  expect(document.querySelector('[aria-label="USB camera"]')).not.toBeNull()
  const networkButton = document.querySelector<HTMLButtonElement>(
    '[aria-label="Network stream"]'
  )!
  expect(networkButton).not.toBeNull()
  await act(async () => networkButton.click())
  expect(
    document.querySelector('[aria-label="Network stream URL"]')
  ).not.toBeNull()
  expect(text).not.toContain("Eye video")
  expect(text).not.toContain("Try sample")
})

test("eye region setup does not require a pupil confirmation checkbox", async () => {
  await act(async () =>
    root.render(
      createElement(RegionControls, {
        tracker: controller,
        chooseRegion: () => {},
      })
    )
  )
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
})

test("network stream URLs activate the camera pipeline with source dimensions", async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response("video", {
      headers: { "Content-Type": "video/mp4" },
    })
  }
  let pending: Promise<void>
  try {
    await act(async () => {
      pending = (controller as any).startNetworkStream(
        "http://camera.local/stream.mp4"
      )
    })
    await act(async () => {
      resolvePlay()
      await pending!
    })
    expect(controller.error).toBe("")
    expect(controller.source?.kind).toBe("network")
    expect(controller.dimensions).toEqual({ width: 640, height: 360 })
    expect(controller.busy).toBe(false)
    expect(requestedUrl).toBe(
      "http://127.0.0.1:4022/stream?url=http%3A%2F%2Fcamera.local%2Fstream.mp4"
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("eye network recovery preserves the locked eye model and source", async () => {
  const originalFetch = globalThis.fetch
  const originalCreate = document.createElement.bind(document)
  let video: HTMLVideoElement | null = null
  globalThis.fetch = async () =>
    new Response("video", {
      headers: { "Content-Type": "video/mp4" },
    })
  document.createElement = ((tag: string) => {
    const element = originalCreate(tag)
    if (tag === "video") video = element as HTMLVideoElement
    return element
  }) as typeof document.createElement
  try {
    let pending: Promise<void>
    await act(async () => {
      pending = controller.startNetworkStream("http://eye.local/stream.mp4")
    })
    await act(async () => {
      resolvePlay()
      await pending!
    })
    await act(async () => controller.configure({ locked: true }, false))
    await act(async () => video!.dispatchEvent(new Event("error")))
    expect(controller.settings.locked).toBe(true)
    expect(controller.source?.kind).toBe("network")
    expect(controller.error).toBe("")
    expect(controller.frame).toBeNull()
  } finally {
    globalThis.fetch = originalFetch
    document.createElement = originalCreate
  }
})

test("MJPEG network streams use decoded frame dimensions instead of video dimensions", async () => {
  const originalFetch = globalThis.fetch
  const originalCreateImageBitmap = globalThis.createImageBitmap
  const decodedFrames: string[] = []
  const multipart =
    "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 5\r\n\r\nJPEG1\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 5\r\n\r\nJPEG2\r\n"
  const multipartBytes = new TextEncoder().encode(multipart)
  const multipartStream = new ReadableStream<Uint8Array>({
    start(stream) {
      for (let offset = 0; offset < multipartBytes.length; offset += 7)
        stream.enqueue(multipartBytes.slice(offset, offset + 7))
    },
  })
  globalThis.fetch = async () =>
    new Response(multipartStream, {
      headers: { "Content-Type": "multipart/x-mixed-replace; boundary=frame" },
    })
  globalThis.createImageBitmap = async (blob) => {
    decodedFrames.push(await blob.text())
    return { width: 320, height: 240, close: () => {} } as ImageBitmap
  }

  try {
    let pending: Promise<void>
    await act(async () => {
      pending = controller.startNetworkStream("http://esp32.local/stream")
      resolvePlay()
      await pending!
    })

    expect(controller.error).toBe("")
    expect(controller.source?.kind).toBe("network")
    expect(controller.dimensions).toEqual({ width: 320, height: 240 })
    expect(decodedFrames).toContain("JPEG1")
  } finally {
    globalThis.fetch = originalFetch
    globalThis.createImageBitmap = originalCreateImageBitmap
  }
})
test("a changed network resolution invalidates setup even if the processing size stays the same", async () => {
  const originalFetch = globalThis.fetch,
    originalCreate = document.createElement.bind(document),
    originalTimeout = globalThis.setTimeout
  let width = 640,
    height = 360,
    retry!: () => void
  const videos: HTMLVideoElement[] = []
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => height,
  })
  document.createElement = ((tag: string) => {
    const element = originalCreate(tag)
    if (tag === "video") videos.push(element as HTMLVideoElement)
    return element
  }) as typeof document.createElement
  globalThis.fetch = (async () =>
    new Response("", {
      headers: { "content-type": "video/mp4" },
    })) as typeof fetch
  globalThis.setTimeout = ((callback: () => void, delay: number) => {
    if (delay === 1000) {
      retry = callback
      return 987654
    }
    return originalTimeout(callback, delay)
  }) as typeof setTimeout
  try {
    let pending!: Promise<void>
    await act(async () => {
      pending = controller.startNetworkStream("http://camera.local/stream.mp4")
      await new Promise((resolve) => originalTimeout(resolve, 0))
    })
    await act(async () => {
      resolvePlay()
      await pending
    })
    await act(async () => controller.configure({ locked: true }, false))
    const originalKey = controller.source?.key,
      originalSize = controller.dimensions
    await act(async () => videos[0].dispatchEvent(new Event("error")))
    expect(controller.settings.locked).toBe(true)
    width = 1280
    height = 720
    await act(async () => {
      retry()
      await new Promise((resolve) => originalTimeout(resolve, 0))
    })
    await act(async () => {
      resolvePlay()
      await new Promise((resolve) => originalTimeout(resolve, 0))
    })
    expect(controller.dimensions).toEqual(originalSize)
    expect(controller.source?.key).not.toBe(originalKey)
    expect(controller.settings.locked).toBe(false)
    expect(controller.error).toBe("")
  } finally {
    globalThis.fetch = originalFetch
    document.createElement = originalCreate
    globalThis.setTimeout = originalTimeout
  }
})

test("switching to a sample while camera permission is pending disposes the late stream", async () => {
  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
    controller.startSample()
  })
  await act(async () => {
    resolveCamera(stream())
    await pending!
  })

  expect(controller.source?.kind).toBe("sample")
  expect(controller.busy).toBe(false)
  expect(stopped).toBe(1)
})

test("late worker errors from an older generation do not replace current state", async () => {
  await act(async () => {
    workers[0]?.onmessage?.({
      data: { type: "error", generation: 100, message: "stale worker error" },
    })
  })

  expect(controller.error).toBe("")
  expect(controller.frame).toBeNull()
})

test("unmounting releases the camera stream and terminates the worker", async () => {
  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
  })
  await act(async () => resolveCamera(stream()))
  await act(async () => {
    resolvePlay()
    await pending!
  })

  await act(async () => root?.unmount())
  root = null

  expect(stopped).toBe(1)
  expect(terminatedWorkers).toBe(1)
  expect(controller.source?.kind).toBe("camera")
})

test("camera and media failures use direct, user-readable guidance", async () => {
  const permissionMessage = getCameraErrorMessage(
    new DOMException("Permission denied", "NotAllowedError")
  )
  const unsupportedVideoMessage = getVideoErrorMessage(null)

  expect(permissionMessage).toContain("Camera permission was denied")
  expect(unsupportedVideoMessage).toContain("MP4 or WebM")

  let pending: Promise<void>
  await act(async () => {
    pending = controller.startCamera("")
    rejectCamera(new DOMException("Permission denied", "NotAllowedError"))
    await pending!
  })

  expect(controller.error).toContain("Allow camera access")
})

test("eye startup rejects a resolved USB device already used by the scene role", async () => {
  let startup: Promise<void>
  resolvePlay = () => {}
  await act(async () => {
    startup = controller.startCamera("", "scene-device")
  })
  const track = {
    label: "Scene camera",
    getSettings: () => ({ deviceId: "scene-device" }),
    stop: () => stopped++,
    addEventListener() {},
  }
  await act(async () =>
    resolveCamera({ getTracks: () => [track], getVideoTracks: () => [track] })
  )
  await act(async () => {
    resolvePlay()
    await startup!
  })
  expect(controller.source).toBeNull()
  expect(controller.error).toContain("different")
  expect(stopped).toBe(1)
})
test("eye source selection disables the active scene USB device", async () => {
  await act(async () =>
    root!.render(
      createElement(SourceControls, {
        tracker: controller,
        resetSource: () => {},
        excludedDeviceId: "camera-1",
      })
    )
  )
  const sceneOption = host.querySelector<HTMLOptionElement>(
    'option[value="camera-1"]'
  )!
  expect(sceneOption.disabled).toBe(true)
  expect(sceneOption.textContent).toContain("scene camera")
})
