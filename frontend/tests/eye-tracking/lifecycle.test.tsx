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
import { RegionControls } from "../../apps/web/src/features/eye-tracking/steps/region-controls"
import { SourceControls } from "../../apps/web/src/features/eye-tracking/steps/source-controls"
GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let controller: TrackerController,
  root: Root,
  host: HTMLDivElement,
  stopped: number,
  resolveCamera: (stream: any) => void,
  resolvePlay: () => void,
  availableDevices: MediaDeviceInfo[],
  deviceChangeListener: (() => void) | null,
  enumerateCalls: number
function Harness() {
  controller = useTracker()
  return null
}
beforeEach(async () => {
  stopped = 0
  enumerateCalls = 0
  availableDevices = [
    { kind: "videoinput", deviceId: "camera-1", label: "" } as MediaDeviceInfo,
  ]
  deviceChangeListener = null
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
  await act(async () => root.unmount())
  host.remove()
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

test("high-resolution camera frames retain eye detail before ROI cropping", async () => {
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
  expect(controller.dimensions).toEqual({ width: 1280, height: 720 })
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
        deviceId: "",
        setDeviceId: () => {},
        resetSource: () => {},
      })
    )
  )
  const labels = Array.from(document.querySelectorAll("option"), (option) =>
    option.textContent?.trim()
  )
  const text = document.body.textContent ?? ""
  expect(labels).toContain("Camera 1")
  expect(text).toContain("USB Camera")
  expect(text).toContain("Network Stream")
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
        "https://camera.example/stream.mp4"
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
    expect(requestedUrl).toBe("https://camera.example/stream.mp4")
  } finally {
    globalThis.fetch = originalFetch
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
