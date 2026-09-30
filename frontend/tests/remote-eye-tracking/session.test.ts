import { expect, test } from "bun:test"
import {
  RemoteSession,
  type SessionEnvironment,
  type SessionState,
} from "../../apps/web/src/features/remote-eye-tracking/session"

function fixture() {
  let resolveStream!: (stream: MediaStream) => void
  let ended: (() => void) | null = null
  let stopped = 0,
    terminated = 0,
    closed = 0
  let frame: FrameRequestCallback | null = null
  let captured = 0
  const track = {
    stop: () => stopped++,
    addEventListener: (_event: string, cb: () => void) => {
      ended = cb
    },
  }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage: () => {},
    terminate: () => terminated++,
  } as unknown as Worker
  const video = {
    srcObject: null,
    currentTime: 0,
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {},
    pause: () => {},
  } as unknown as HTMLVideoElement
  const states: SessionState[] = []
  const env: SessionEnvironment = {
    getStream: () =>
      new Promise((resolve) => {
        resolveStream = resolve
      }),
    enumerate: async () => [],
    worker: () => worker,
    capture: async () => {
      captured++
      return { close: () => closed++ } as ImageBitmap
    },
    requestFrame: (cb) => {
      frame = cb
      return 1
    },
    cancelFrame: () => {
      frame = null
    },
  }
  const session = new RemoteSession(video, (state) => states.push(state), env)
  const ready = () =>
    worker.onmessage?.({
      data: { type: "ready", method: "test" },
    } as MessageEvent)
  return {
    session,
    states,
    stream,
    worker,
    ready,
    resolve: () => resolveStream(stream),
    tick: () => frame?.(10),
    ended: () => ended?.(),
    stopped: () => stopped,
    terminated: () => terminated,
    closed: () => closed,
    captured: () => captured,
    video,
  }
}
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test("a permission response arriving after Stop is released and never activates the camera", async () => {
  const f = fixture()
  const start = f.session.start("mobile")
  f.session.stop()
  f.resolve()
  await start
  expect(f.stopped()).toBe(1)
  expect(f.video.srcObject).toBeNull()
  expect(f.states.at(-1)?.status).toBe("idle")
})
test("camera and model must both be ready before tracking starts", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  expect(f.states.at(-1)?.status).toBe("loading")
  f.ready()
  await flush()
  expect(f.states.at(-1)?.status).toBe("ready")
  f.session.stop()
  expect(f.stopped()).toBe(1)
  expect(f.terminated()).toBe(1)
})
test("fatal model errors release an active stream and are visible", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.worker.onmessage?.({
    data: { type: "error", fatal: true, message: "Model could not load" },
  } as MessageEvent)
  expect(f.states.at(-1)?.status).toBe("error")
  expect(f.states.at(-1)?.error).toBe("Model could not load")
  expect(f.stopped()).toBe(1)
  expect(f.terminated()).toBe(1)
})
test("camera disconnection clears the last result and releases resources", async () => {
  const f = fixture()
  const start = f.session.start("ir")
  f.resolve()
  await start
  f.ready()
  f.ended()
  expect(f.states.at(-1)?.status).toBe("error")
  expect(f.states.at(-1)?.observation).toBeNull()
  expect(f.stopped()).toBe(1)
})
test("a frame captured after Stop is closed instead of posted to a terminated worker", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.ready()
  f.tick()
  f.session.stop()
  await flush()
  expect(f.closed()).toBe(1)
})

test("an unchanged physical video frame is not captured again as a fresh observation", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.ready()
  f.tick()
  await flush()
  f.worker.onmessage?.({
    data: {
      type: "result",
      observation: { timestamp: performance.now(), feature: null },
    },
  } as MessageEvent)
  f.tick()
  await flush()
  expect(f.captured()).toBe(1)
  f.video.currentTime = 0.033
  f.tick()
  await flush()
  expect(f.captured()).toBe(2)
  f.session.stop()
})

test("last gaze expires when the camera presents no further source frames", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.ready()
  f.worker.onmessage?.({
    data: {
      type: "result",
      observation: { timestamp: performance.now(), feature: [0.5] },
    },
  } as MessageEvent)
  expect(f.states.at(-1)?.observation).not.toBeNull()
  await new Promise((resolve) => setTimeout(resolve, 1050))
  expect(f.states.at(-1)?.observation).toBeNull()
  f.session.stop()
})
