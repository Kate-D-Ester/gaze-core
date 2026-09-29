import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { openNetworkSource } from "../../apps/web/src/features/eye-tracking/network-source"

if (typeof document === "undefined") GlobalRegistrator.register()

const originalFetch = globalThis.fetch
const originalVideoPlay = HTMLVideoElement.prototype.play
const originalVideoWidth = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  "videoWidth"
)
const originalVideoHeight = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  "videoHeight"
)

afterEach(() => {
  globalThis.fetch = originalFetch
  HTMLVideoElement.prototype.play = originalVideoPlay
  restoreVideoDimension("videoWidth", originalVideoWidth)
  restoreVideoDimension("videoHeight", originalVideoHeight)
})

function restoreVideoDimension(
  name: "videoWidth" | "videoHeight",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(HTMLVideoElement.prototype, name, descriptor)
    return
  }

  delete (HTMLVideoElement.prototype as any)[name]
}

function createMjpegResponse() {
  const content =
    "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 5\r\n\r\nJPEG1\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 5\r\n\r\nJPEG2\r\n"
  const bytes = new TextEncoder().encode(content)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 9) {
        controller.enqueue(bytes.slice(offset, offset + 9))
      }
      controller.close()
    },
  })

  return new Response(body, {
    headers: {
      "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    },
  })
}

test("opens MJPEG directly from its network URL", async () => {
  let requestedUrl = ""
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return createMjpegResponse()
  }

  const source = await openNetworkSource(
    "http://esp32.local/stream",
    new AbortController().signal
  )

  expect(requestedUrl).toBe("http://esp32.local/stream")
  expect(source.kind).toBe("mjpeg")
  if (source.kind !== "mjpeg") throw new Error("Expected an MJPEG source")
  expect(new TextDecoder().decode(source.firstFrame)).toBe("JPEG1")

  const remainingFrames: string[] = []
  for await (const frame of source.frames) {
    remainingFrames.push(new TextDecoder().decode(frame))
  }
  expect(remainingFrames).toEqual(["JPEG2"])
})

test("explains network, CORS, and default ESP32 stream port failures", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch")
  }

  await expect(
    openNetworkSource(
      "http://esp32.local/stream",
      new AbortController().signal
    )
  ).rejects.toThrow(
    /could not reach or read.*same network.*esp32\.local:81\/stream.*Access-Control-Allow-Origin/is
  )
})

test("rejects non-HTTP network source URLs before fetching", async () => {
  let requested = false
  globalThis.fetch = async () => {
    requested = true
    return new Response()
  }

  await expect(
    openNetworkSource("file:///tmp/eye.mjpeg", new AbortController().signal)
  ).rejects.toThrow(/HTTP or HTTPS/i)
  expect(requested).toBe(false)
})

test("reports HTTP errors from the camera directly", async () => {
  globalThis.fetch = async () => new Response("unavailable", { status: 503 })

  await expect(
    openNetworkSource(
      "http://camera.example/stream",
      new AbortController().signal
    )
  ).rejects.toThrow("The camera returned HTTP 503")
})

test("rejects MJPEG responses that do not declare a boundary", async () => {
  globalThis.fetch = async () =>
    new Response("", {
      headers: { "Content-Type": "multipart/x-mixed-replace" },
    })

  await expect(
    openNetworkSource(
      "http://camera.example/stream",
      new AbortController().signal
    )
  ).rejects.toThrow("invalid MJPEG boundary")
})

test("opens browser-playable network video after checking its response type", async () => {
  globalThis.fetch = async () =>
    new Response("video", {
      headers: { "Content-Type": "video/mp4" },
    })
  HTMLVideoElement.prototype.play = async () => {}
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 640,
  })
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 360,
  })

  const source = await openNetworkSource(
    "https://camera.example/eye.mp4",
    new AbortController().signal
  )

  expect(source.kind).toBe("video")
  if (source.kind !== "video") throw new Error("Expected a video source")
  expect(source.video.crossOrigin).toBe("anonymous")
  expect(source.video.videoWidth).toBe(640)
  source.video.pause()
})

test("reports when the browser cannot decode a network video", async () => {
  globalThis.fetch = async () =>
    new Response("video", {
      headers: { "Content-Type": "video/mp4" },
    })
  HTMLVideoElement.prototype.play = async () => {
    throw new Error("Unsupported video source")
  }

  await expect(
    openNetworkSource(
      "https://camera.example/eye.mp4",
      new AbortController().signal
    )
  ).rejects.toThrow(/could not play.*reachable.*CORS/i)
})

test("aborting an MJPEG source releases the pending response reader", async () => {
  let cancelled = false
  const controller = new AbortController()
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true
    },
  })
  globalThis.fetch = async () =>
    new Response(body, {
      headers: {
        "Content-Type": "multipart/x-mixed-replace; boundary=frame",
      },
    })

  const pendingSource = openNetworkSource(
    "http://camera.example/stream",
    controller.signal
  )
  await Promise.resolve()
  await Promise.resolve()
  controller.abort()

  await expect(pendingSource).rejects.toMatchObject({ name: "AbortError" })
  expect(cancelled).toBe(true)
})
