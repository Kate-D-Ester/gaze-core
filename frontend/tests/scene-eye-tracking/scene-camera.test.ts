import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"

let stopped: string[],
  cameras: SceneCamera[],
  pending: ((stream: MediaStream) => void)[],
  callbacks: Map<number, FrameRequestCallback>,
  videoTime: number,
  videoFrameCount: number,
  videos: HTMLVideoElement[]
const originalCreate = document.createElement.bind(document)
const originalFetch = globalThis.fetch
function stream(id: string): MediaStream {
  const track = new EventTarget() as MediaStreamTrack
  Object.assign(track, {
    label: id,
    stop: () => stopped.push(id),
    getSettings: () => ({ deviceId: id }),
  })
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as MediaStream
}
beforeEach(() => {
  localStorage.clear()
  stopped = []
  cameras = []
  pending = []
  callbacks = new Map()
  videoTime = 0
  videoFrameCount = 0
  videos = []
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () =>
        new Promise<MediaStream>((resolve) => pending.push(resolve)),
      enumerateDevices: async () => [],
      addEventListener() {},
      removeEventListener() {},
    },
  })
  document.createElement = ((tag: string) => {
    const element = originalCreate(tag)
    if (tag === "video") {
      videos.push(element as HTMLVideoElement)
      Object.defineProperties(element, {
        srcObject: { value: null, writable: true },
        videoWidth: { get: () => 640 },
        videoHeight: { get: () => 480 },
        readyState: { get: () => 2 },
        currentTime: { get: () => videoTime },
        getVideoPlaybackQuality: {
          value: () => ({
            totalVideoFrames: videoFrameCount,
            droppedVideoFrames: 0,
          }),
        },
        play: { value: async () => {} },
        pause: { value: () => {} },
        load: { value: () => {} },
      })
    }
    if (tag === "canvas")
      Object.defineProperty(element, "getContext", {
        value: () => ({
          drawImage() {},
          save() {},
          setTransform() {},
          fillRect() {},
          restore() {},
        }),
      })
    return element
  }) as typeof document.createElement
  globalThis.requestAnimationFrame = (cb) => {
    const id = callbacks.size + 1
    callbacks.set(id, cb)
    return id
  }
  globalThis.cancelAnimationFrame = (id) => {
    callbacks.delete(id)
  }
})
afterEach(() => {
  cameras.forEach((c) => c.dispose())
  document.createElement = originalCreate
  globalThis.fetch = originalFetch
})
function camera() {
  const c = new SceneCamera()
  cameras.push(c)
  return c
}
function tick(time: number) {
  videoTime += 0.05
  videoFrameCount++
  const next = [...callbacks.values()]
  callbacks.clear()
  next.forEach((cb) => cb(time))
}

test("two independent cameras keep their own sources and release only owned tracks", async () => {
  const eye = camera(),
    scene = camera()
  const a = eye.startCamera("eye"),
    b = scene.startCamera("scene")
  pending[0](stream("eye"))
  pending[1](stream("scene"))
  await Promise.all([a, b])
  expect(eye.getSnapshot().source?.deviceId).toBe("eye")
  expect(scene.getSnapshot().source?.deviceId).toBe("scene")
  scene.stop()
  expect(stopped).toEqual(["scene"])
  expect(eye.getSnapshot().source).not.toBeNull()
  eye.dispose()
  expect(stopped).toEqual(["scene", "eye"])
})
test("obsolete camera permission results cannot reactivate or stop the replacement", async () => {
  const c = camera(),
    first = c.startCamera("one"),
    second = c.startCamera("two")
  pending[1](stream("two"))
  await second
  pending[0](stream("one"))
  await first
  expect(c.getSnapshot().source?.deviceId).toBe("two")
  expect(stopped).toEqual(["one"])
})
test("cancel pending startup disposes the late permission stream", async () => {
  const c = camera(),
    start = c.startCamera("one")
  c.stop()
  pending[0](stream("one"))
  await start
  expect(c.getSnapshot().source).toBeNull()
  expect(c.getSnapshot().busy).toBe(false)
  expect(stopped).toEqual(["one"])
})
test("same USB device cannot become both the eye and scene camera", async () => {
  const c = camera(),
    start = c.startCamera("", "eye")
  pending[0](stream("eye"))
  await start
  expect(c.getSnapshot().source).toBeNull()
  expect(c.getSnapshot().error).toContain("different")
  expect(stopped).toEqual(["eye"])
})
test("fresh decoded frames keep native dimensions and stalled video becomes an error", async () => {
  const c = camera(),
    start = c.startCamera("scene")
  pending[0](stream("scene"))
  await start
  tick(performance.now())
  expect(c.latest?.width).toBe(640)
  expect(c.latest?.height).toBe(480)
  expect(c.rawCanvas.width).toBe(640)
  const last = c.latest!.timestamp
  const next = [...callbacks.values()]
  callbacks.clear()
  next.forEach((cb) => cb(last + 3000))
  expect(c.getSnapshot().error).toContain("stopped")
  expect(c.getSnapshot().source).toBeNull()
})
test("network mDNS video uses the existing browser-readable source pipeline", async () => {
  globalThis.fetch = (async () =>
    new Response("", {
      headers: { "content-type": "video/mp4" },
    })) as typeof fetch
  const c = camera()
  await c.startNetworkStream("http://scene.local/stream.mp4")
  tick(performance.now())
  expect(c.getSnapshot().source?.kind).toBe("network")
  expect(c.latest?.height).toBe(480)
})
test("scene orientation transforms raw frames and rejects landmarks from the previous orientation", async () => {
  const c = camera(),
    start = c.startCamera("scene")
  pending[0](stream("scene"))
  await start
  tick(performance.now())
  const previous = c.latest!,
    key = c.getSnapshot().source!.key
  c.setTransform({ rotation: 90, mirrorX: true, mirrorY: false })
  expect(c.latest).toBeNull()
  tick(performance.now())
  expect([c.rawCanvas.width, c.rawCanvas.height]).toEqual([480, 640])
  expect(c.latest?.generation).not.toBe(previous.generation)
  expect(c.getSnapshot().source?.key).toBe(key)
  expect(c.getSnapshot().transform.mirrorX).toBe(true)
})

test("network video pauses keep the selected source and recover automatically", async () => {
  globalThis.fetch = (async () =>
    new Response("", {
      headers: { "content-type": "video/mp4" },
    })) as typeof fetch
  const originalTimeout = globalThis.setTimeout
  const scheduled: { callback: () => void; delay: number }[] = []
  globalThis.setTimeout = ((callback: () => void, delay: number) => {
    scheduled.push({ callback, delay })
    return scheduled.length
  }) as typeof setTimeout
  try {
    const c = camera()
    await c.startNetworkStream("http://scene.local/stream.mp4")
    tick(performance.now())
    const source = c.getSnapshot().source
    videos.at(-1)!.dispatchEvent(new Event("error"))
    expect(c.getSnapshot().source).toEqual(source)
    expect(c.getSnapshot().error).toBe("")
    expect(c.latest).toBeNull()
    expect((c.getSnapshot() as any).connection).toBe("reconnecting")
    const retry = scheduled.find(
      (timer) => timer.delay >= 1000 && timer.delay < 15000
    )
    expect(retry).toBeDefined()
    retry!.callback()
    await new Promise((resolve) => originalTimeout(resolve, 0))
    tick(performance.now())
    expect(c.getSnapshot().source?.key).toBe(source?.key)
    expect(c.latest).not.toBeNull()
    expect((c.getSnapshot() as any).connection).toBe("live")
  } finally {
    globalThis.setTimeout = originalTimeout
  }
})

test("a short network stall does not disconnect the camera", async () => {
  globalThis.fetch = (async () =>
    new Response("", {
      headers: { "content-type": "video/mp4" },
    })) as typeof fetch
  const c = camera()
  await c.startNetworkStream("http://scene.local/stream.mp4")
  const now = performance.now()
  tick(now)
  const source = c.getSnapshot().source
  const next = [...callbacks.values()]
  callbacks.clear()
  next.forEach((cb) => cb(now + 3000))
  expect(c.getSnapshot().source).toEqual(source)
  expect(c.getSnapshot().error).toBe("")
  expect(c.latest).toBeNull()
})
test("abort releases a pending MJPEG response reader", async () => {
  let cancelled = false
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true
        },
      }),
      {
        headers: {
          "content-type": "multipart/x-mixed-replace; boundary=frame",
        },
      }
    )) as typeof fetch
  const c = camera(),
    start = c.startNetworkStream("http://esp32.local:81/stream")
  await new Promise((resolve) => setTimeout(resolve, 0))
  c.stop()
  await start
  expect(cancelled).toBe(true)
  expect(c.getSnapshot().error).toBe("")
})

test("a missing relay shows a useful error and leaves Connect available", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch")
  }) as typeof fetch
  const c = camera()

  await c.startNetworkStream("http://esp32.local/stream")

  expect(c.getSnapshot().connection).toBe("error")
  expect(c.getSnapshot().busy).toBe(false)
  expect(c.getSnapshot().error).toMatch(/camera relay.*bun run dev/i)
  expect(c.getSnapshot().source).toBeNull()
})

test("media-clock advancement without a presented frame neither refreshes scene evidence nor hides a stall", async () => {
  const c = camera(),
    start = c.startCamera("scene")
  let callback: VideoFrameRequestCallback | null = null,
    canceled = 0
  // The video is created after the permission promise resolves.
  pending[0](stream("scene"))
  await start
  c.stop()
  const create = document.createElement
  document.createElement = ((tag: string) => {
    const element = create(tag)
    if (tag === "video")
      Object.defineProperties(element, {
        requestVideoFrameCallback: {
          value: (fn: VideoFrameRequestCallback) => {
            callback = fn
            return 7
          },
        },
        cancelVideoFrameCallback: {
          value: () => {
            canceled++
          },
        },
      })
    return element
  }) as typeof document.createElement
  const restart = c.startCamera("scene")
  pending[1](stream("scene"))
  await restart
  const now = performance.now()
  callback?.(now, { presentedFrames: 1 } as VideoFrameCallbackMetadata)
  tick(now)
  const first = c.latest
  expect(first).not.toBeNull()
  tick(now + 50)
  expect(c.latest).toBe(first)
  tick(now + 3000)
  expect(c.getSnapshot().error).toContain("stopped")
  expect(canceled).toBe(1)
})
test("video-frame-count fallback ignores media clock ticks without newly presented frames", async () => {
  const c = camera(),
    start = c.startCamera("scene")
  pending[0](stream("scene"))
  await start
  const now = performance.now()
  tick(now)
  const first = c.latest
  videoTime += 0.05
  const repaint = [...callbacks.values()]
  callbacks.clear()
  repaint.forEach((cb) => cb(now + 50))
  expect(c.latest).toBe(first)
})
