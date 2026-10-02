import { expect, test } from "bun:test"
import {
  RemoteSession,
  type SessionEnvironment,
  type SessionState,
} from "../../apps/web/src/features/remote-eye-tracking/session"
import type {
  RemoteRequest,
  RemoteResponse,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

function replayFixture(overrides: Partial<SessionEnvironment> = {}) {
  const states: SessionState[] = []
  const revoked: string[] = []
  const workers: TestWorker[] = []
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 0,
    permissions = 0,
    closed = 0,
    captures = 0,
    stopped = 0
  const stream = {
    getTracks: () => [{ stop: () => stopped++ }],
    getVideoTracks: () => [],
  } as unknown as MediaStream
  class TestWorker {
    onmessage: ((event: MessageEvent<RemoteResponse>) => void) | null = null
    onerror: (() => void) | null = null
    requests: RemoteRequest[] = []
    terminated = false
    postMessage(request: RemoteRequest) {
      this.requests.push(request)
    }
    terminate() {
      this.terminated = true
    }
    emit(data: RemoteResponse) {
      this.onmessage?.({ data } as MessageEvent<RemoteResponse>)
    }
  }
  const video = Object.assign(new EventTarget(), {
    srcObject: null,
    src: "",
    currentTime: 0,
    seeking: false,
    ended: false,
    paused: false,
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {
      if (!video.paused) return
      video.paused = false
      queueMicrotask(() => video.dispatchEvent(new Event("play")))
    },
    pause: () => {
      if (video.paused) return
      video.paused = true
      queueMicrotask(() => video.dispatchEvent(new Event("pause")))
    },
    removeAttribute: (name: string) => {
      if (name === "src") video.src = ""
    },
    load: () => {},
  }) as unknown as HTMLVideoElement
  const env: SessionEnvironment = {
    getStream: async () => {
      permissions++
      return stream
    },
    enumerate: async () => [],
    worker: () => {
      const worker = new TestWorker()
      workers.push(worker)
      return worker as unknown as Worker
    },
    capture: async () => {
      captures++
      return { close: () => closed++ } as ImageBitmap
    },
    requestFrame: (callback) => {
      callbacks.set(++nextId, callback)
      return nextId
    },
    cancelFrame: (id) => {
      callbacks.delete(id)
    },
    createObjectURL: () => `blob:local-${workers.length + 1}`,
    revokeObjectURL: (url) => revoked.push(url),
    ...overrides,
  }
  const session = new RemoteSession(video, (state) => states.push(state), env)
  const currentWorker = () => workers.at(-1)!
  const result = () =>
    currentWorker().emit({
      type: "result",
      observation: {
        timestamp: performance.now(),
        width: 640,
        height: 480,
        quality: 0.9,
        reason: null,
        feature: [0.5],
        pose: null,
        eyes: [],
        faceBox: null,
        basePoint: null,
        method: "inspection",
        processingMs: 1,
      },
    })
  return {
    session,
    video,
    states,
    workers,
    revoked,
    stream,
    currentWorker,
    result,
    ready: () => currentWorker().emit({ type: "ready", method: "inspection" }),
    tick: () => {
      const queued = [...callbacks.values()]
      callbacks.clear()
      queued.forEach((callback) => callback(performance.now()))
    },
    event: (name: string) => video.dispatchEvent(new Event(name)),
    permissions: () => permissions,
    captures: () => captures,
    closed: () => closed,
    stopped: () => stopped,
  }
}
const file = () => new File(["local video"], "eyes.mp4", { type: "video/mp4" })
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test("local replay bypasses camera permission and waits for media plus model", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    expect(f.permissions()).toBe(0)
    expect(f.video.srcObject).toBeNull()
    expect(f.video.src).toBe("blob:local-1")
    expect(f.states.at(-1)?.status).toBe("loading")
    f.ready()
    expect(f.states.at(-1)?.status).toBe("ready")
    expect(f.states.at(-1)?.source).toBe("video")
  } finally {
    f.session.dispose()
  }
})

test.each(["stop", "dispose"] as const)(
  "%s releases a replay URL and prevents the old worker from publishing observations",
  async (action) => {
    const f = replayFixture()
    await f.session.startVideo("ir", file())
    f.ready()
    const oldResult = f.currentWorker().onmessage!
    f.session[action]()
    const count = f.states.length
    f.result()
    oldResult({
      data: { type: "ready", method: "late" },
    } as MessageEvent<RemoteResponse>)
    expect(f.revoked).toEqual(["blob:local-1"])
    expect(f.video.src).toBe("")
    expect(f.currentWorker().terminated).toBe(true)
    expect(f.states).toHaveLength(count)
  }
)

test("switching local files releases the previous source and isolates old playback events", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    const previous = f.currentWorker()
    await f.session.startVideo("ir", file())
    f.ready()
    expect(f.revoked).toEqual(["blob:local-1"])
    expect(f.video.src).toBe("blob:local-2")
    expect(previous.terminated).toBe(true)
    previous.emit({ type: "error", message: "Old file failed", fatal: true })
    expect(f.states.at(-1)?.status).toBe("ready")
  } finally {
    f.session.dispose()
  }
})

test("a pending camera grant is released after switching to a recording", async () => {
  let grant!: (stream: MediaStream) => void
  const f = replayFixture({
    getStream: () =>
      new Promise((resolve) => {
        grant = resolve
      }),
  })
  try {
    const camera = f.session.start("ir")
    await f.session.startVideo("ir", file())
    f.ready()
    grant(f.stream)
    await camera
    expect(f.stopped()).toBe(1)
    expect(f.video.srcObject).toBeNull()
    expect(f.states.at(-1)?.source).toBe("video")
    expect(f.states.at(-1)?.status).toBe("ready")
  } finally {
    f.session.dispose()
  }
})

test("replay frames use recording time for history while retaining wall time freshness", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.video.currentTime = 12.5
    f.tick()
    await flush()
    const frame = f
      .currentWorker()
      .requests.find((request) => request.type === "frame")
    expect(frame?.type).toBe("frame")
    if (frame?.type !== "frame") throw new Error("Expected captured frame")
    expect(frame.mediaTimestamp).toBe(12500)
    expect(Math.abs(performance.now() - frame.timestamp)).toBeLessThan(1000)
    f.tick()
    await flush()
    expect(f.captures()).toBe(1)
    f.result()
    expect(f.states.at(-1)?.observation?.source).toBe("video")
    await new Promise((resolve) => setTimeout(resolve, 1050))
    expect(f.states.at(-1)?.observation).toBeNull()
  } finally {
    f.session.dispose()
  }
})

test("seeking clears the observation, rejects in-flight inference, and starts new temporal history", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.result()
    const oldWorker = f.currentWorker()
    f.video.currentTime = 8
    f.video.seeking = true
    f.event("seeking")
    expect(f.states.at(-1)?.observation).toBeNull()
    expect(oldWorker.terminated).toBe(true)
    oldWorker.emit({ type: "error", message: "Late inference", fatal: true })
    expect(f.states.at(-1)?.status).not.toBe("error")
    f.video.currentTime = 2
    f.video.seeking = false
    f.event("seeked")
    f.ready()
    f.tick()
    await flush()
    expect(f.workers).toHaveLength(2)
    const frame = f
      .currentWorker()
      .requests.find((request) => request.type === "frame")
    expect(frame?.type === "frame" && frame.mediaTimestamp).toBe(2000)
    expect(f.revoked).toEqual([])
  } finally {
    f.session.dispose()
  }
})

test("a capture completing after a seek closes its bitmap instead of crossing timelines", async () => {
  let complete!: (frame: ImageBitmap) => void
  let closed = 0
  const f = replayFixture({
    capture: () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  })
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.tick()
    f.event("seeking")
    f.event("seeked")
    complete({ close: () => closed++ } as ImageBitmap)
    await flush()
    expect(closed).toBe(1)
    expect(
      f.currentWorker().requests.some((request) => request.type === "frame")
    ).toBe(false)
  } finally {
    f.session.dispose()
  }
})

test("end of a recording clears pupil and head readouts without accepting a late result", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.result()
    f.video.ended = true
    f.event("ended")
    f.result()
    expect(f.states.at(-1)?.observation).toBeNull()
  } finally {
    f.session.dispose()
  }
})

test("an unreadable recording clears the observation and releases local media", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.result()
    f.event("error")
    expect(f.states.at(-1)?.status).toBe("error")
    expect(f.states.at(-1)?.observation).toBeNull()
    expect(f.revoked).toEqual(["blob:local-1"])
  } finally {
    f.session.dispose()
  }
})

test("a recording waits for model setup before advancing playback", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    expect(f.video.paused).toBe(true)
    f.ready()
    await flush()
    expect(f.video.paused).toBe(false)
  } finally {
    f.session.dispose()
  }
})

test.each([false, true])(
  "seeking waits for model history reset and preserves prior pause state (%s)",
  async (paused) => {
    const f = replayFixture()
    try {
      await f.session.startVideo("ir", file())
      f.ready()
      f.video.paused = paused
      f.video.seeking = true
      f.event("seeking")
      expect(f.video.paused).toBe(true)
      f.video.seeking = false
      f.event("seeked")
      f.ready()
      await flush()
      expect(f.video.paused).toBe(paused)
    } finally {
      f.session.dispose()
    }
  }
)

test("a paused seek measures its selected frame without waiting for playback to advance", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.video.paused = true
    f.video.seeking = true
    f.event("seeking")
    f.video.currentTime = 2.5
    f.video.seeking = false
    f.event("seeked")
    f.ready()
    await flush()
    const frame = f
      .currentWorker()
      .requests.find((request) => request.type === "frame")
    expect(frame?.type === "frame" && frame.mediaTimestamp).toBe(2500)
  } finally {
    f.session.dispose()
  }
})

test("scrubbing twice before model reset completes preserves the original play intent", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.video.seeking = true
    f.event("seeking")
    f.video.seeking = false
    f.event("seeked")
    f.video.seeking = true
    f.event("seeking")
    f.video.seeking = false
    f.event("seeked")
    f.ready()
    await flush()
    expect(f.video.paused).toBe(false)
  } finally {
    f.session.dispose()
  }
})

test("an explicit pause during model reset cancels automatic replay resumption", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.video.seeking = true
    f.event("seeking")
    f.video.seeking = false
    f.event("seeked")
    await flush()
    await f.video.play()
    f.video.pause()
    f.event("pause")
    f.ready()
    await flush()
    expect(f.video.paused).toBe(true)
  } finally {
    f.session.dispose()
  }
})

test("changing settings on a paused recording remeasures the same media frame with fresh history", async () => {
  const f = replayFixture()
  try {
    await f.session.startVideo("ir", file())
    f.ready()
    f.video.currentTime = 1.25
    f.video.pause()
    const settings = { roi: { x: 0, y: 0, width: 1, height: 1 }, threshold: 80 }
    f.session.setSettings(settings)
    expect(f.workers).toHaveLength(2)
    f.ready()
    await flush()
    const frame = f
      .currentWorker()
      .requests.find((request) => request.type === "frame")
    expect(frame?.type === "frame" && frame.mediaTimestamp).toBe(1250)
    expect(frame?.type === "frame" && frame.settings.threshold).toBe(80)
    expect(f.video.paused).toBe(true)
    f.session.setSettings({ ...settings, roi: { ...settings.roi } })
    expect(f.workers).toHaveLength(2)
  } finally {
    f.session.dispose()
  }
})
