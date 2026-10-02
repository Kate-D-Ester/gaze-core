import { afterEach, expect, test } from "bun:test"
import { MarkerTracker } from "../../apps/web/src/features/scene-eye-tracking/marker-tracker"
import type { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import type { SceneObservation } from "../../apps/web/src/features/scene-eye-tracking/scene.types"

let trackers: MarkerTracker[] = []
afterEach(() => {
  trackers.forEach((tracker) => tracker.dispose())
  trackers = []
})
type WorkerMessage = {
  type: string
  generation: number
  scene?: SceneObservation
  bitmap?: ImageBitmap
}
function harness(deferred = false, browserBitmap = false) {
  let listener = () => {},
    closed = 0,
    terminated = 0,
    captures = 0
  const pending: ((bitmap: ImageBitmap) => void)[] = []
  const camera = {
    rawCanvas: { width: 1920, height: 1080 },
    latest: {
      id: 1,
      timestamp: performance.now(),
      width: 1920,
      height: 1080,
      generation: 1,
    } as SceneObservation | null,
    subscribe(fn: () => void) {
      listener = fn
      return () => {
        listener = () => {}
      }
    },
  }
  const workers: {
    onmessage: ((event: MessageEvent) => void) | null
    onerror: (() => void) | null
    onmessageerror: (() => void) | null
    messages: WorkerMessage[]
    postMessage: (message: WorkerMessage, transfers?: Transferable[]) => void
    terminate: () => void
  }[] = []
  const factory = () => {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      messages: [] as WorkerMessage[],
      postMessage(message: WorkerMessage, transfers?: Transferable[]) {
        if (message.type === "frame")
          expect(transfers).toEqual([message.bitmap!])
        this.messages.push(message)
      },
      terminate() {
        terminated++
      },
    }
    workers.push(worker)
    return worker as unknown as Worker
  }
  const bitmap = () => {
    captures++
    const value = {
      close() {
        closed++
      },
    } as ImageBitmap
    if (deferred)
      return new Promise<ImageBitmap>((resolve) => pending.push(resolve))
    return Promise.resolve(value)
  }
  const tracker = new MarkerTracker(
    camera as unknown as SceneCamera,
    factory,
    browserBitmap ? undefined : bitmap
  )
  trackers.push(tracker)
  tracker.start()
  const reply = (workerIndex: number, message: object) => {
    const worker = workers[workerIndex]
    worker.onmessage?.({
      data: { generation: worker.messages[0].generation, ...message },
    } as MessageEvent)
  }
  const result = (
    workerIndex = 0,
    frame = workers[workerIndex].messages.at(-1)!
  ) =>
    reply(workerIndex, {
      type: "result",
      marker: {
        scene: frame.scene,
        position: [0.3, 0.4],
        corners: [
          [0.2, 0.3],
          [0.4, 0.3],
          [0.4, 0.5],
          [0.2, 0.5],
        ],
      },
    })
  return {
    tracker,
    camera,
    workers,
    reply,
    result,
    tick: () => listener(),
    resolve() {
      pending.shift()?.({
        close() {
          closed++
        },
      } as ImageBitmap)
    },
    captures: () => captures,
    closed: () => closed,
    terminated: () => terminated,
  }
}
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

test("fresh results supply raw marker coordinates with original scene metadata", async () => {
  const h = harness()
  expect(h.tracker.getSnapshot().status).toBe("loading")
  h.reply(0, { type: "ready" })
  await flush()
  h.result()
  expect(h.tracker.getSnapshot()).toMatchObject({
    status: "ready",
    marker: { position: [0.3, 0.4], scene: h.camera.latest },
  })
  expect(h.captures()).toBe(1)
})
test("one frame is in flight and completion processes only the newest waiting frame", async () => {
  const h = harness()
  h.reply(0, { type: "ready" })
  await flush()
  const first = h.workers[0].messages.at(-1)!
  for (const id of [2, 3, 4]) {
    h.camera.latest = { ...h.camera.latest!, id }
    h.tick()
  }
  expect(h.captures()).toBe(1)
  h.result(0, first)
  await flush()
  expect(
    h.workers[0].messages
      .filter((message) => message.type === "frame")
      .map((message) => message.scene!.id)
  ).toEqual([1, 4])
  h.result()
  h.tick()
  await flush()
  expect(h.captures()).toBe(2)
})
test("results older than the allowed camera gap are discarded and latest capture continues", async () => {
  const h = harness()
  h.reply(0, { type: "ready" })
  await flush()
  const first = h.workers[0].messages.at(-1)!
  h.camera.latest = {
    ...h.camera.latest!,
    id: 2,
    timestamp: h.camera.latest!.timestamp + 1000,
  }
  h.tick()
  h.result(0, first)
  await flush()
  expect(h.tracker.getSnapshot().marker).toBeNull()
  expect(h.workers[0].messages.at(-1)?.scene?.id).toBe(2)
  h.result()
  expect(h.tracker.getSnapshot().marker?.scene.id).toBe(2)
})
test("camera source generation immediately clears evidence and rejects the former source", async () => {
  const h = harness()
  h.reply(0, { type: "ready" })
  await flush()
  h.result()
  expect(h.tracker.getSnapshot().marker).not.toBeNull()
  h.camera.latest = { ...h.camera.latest!, id: 2 }
  h.tick()
  await flush()
  const oldSource = h.workers[0].messages.at(-1)!
  h.camera.latest = { ...h.camera.latest!, id: 1, generation: 2 }
  h.tick()
  expect(h.tracker.getSnapshot().marker).toBeNull()
  h.result(0, oldSource)
  await flush()
  expect(h.tracker.getSnapshot().marker).toBeNull()
  expect(h.workers[0].messages.at(-1)?.scene?.generation).toBe(2)
})
test("generation change during bitmap creation closes it and captures the new source without another camera event", async () => {
  const h = harness(true)
  h.reply(0, { type: "ready" })
  h.camera.latest = { ...h.camera.latest!, generation: 2 }
  h.tick()
  h.resolve()
  await flush()
  expect(h.closed()).toBe(1)
  expect(h.captures()).toBe(2)
  h.resolve()
  await flush()
  expect(h.workers[0].messages.at(-1)?.scene?.generation).toBe(2)
})
test("camera removal clears evidence and rejects late results", async () => {
  const h = harness()
  h.reply(0, { type: "ready" })
  await flush()
  const first = h.workers[0].messages.at(-1)!
  h.camera.latest = null
  h.tick()
  h.result(0, first)
  expect(h.tracker.getSnapshot().marker).toBeNull()
})
test("retry rejects former worker epochs and dispose releases pending images", async () => {
  const h = harness(true)
  const staleHandler = h.workers[0].onmessage!
  const oldEpoch = h.workers[0].messages[0].generation
  h.reply(0, { type: "ready" })
  h.tracker.start()
  expect(h.terminated()).toBe(1)
  staleHandler({
    data: { type: "ready", generation: oldEpoch },
  } as MessageEvent)
  expect(h.tracker.getSnapshot().status).toBe("loading")
  h.resolve()
  await flush()
  expect(h.closed()).toBe(1)
  h.reply(1, { type: "ready" })
  h.tracker.dispose()
  h.resolve()
  await flush()
  expect(h.closed()).toBe(2)
  expect(h.terminated()).toBe(2)
  expect(h.tracker.getSnapshot()).toMatchObject({
    status: "idle",
    marker: null,
  })
})
test("unexpected result cannot release the current frame or publish evidence", async () => {
  const h = harness()
  h.reply(0, { type: "ready" })
  await flush()
  const first = h.workers[0].messages.at(-1)!
  h.result(0, { ...first, scene: { ...first.scene!, id: 999 } })
  h.camera.latest = { ...h.camera.latest!, id: 2 }
  h.tick()
  await flush()
  expect(h.tracker.getSnapshot().marker).toBeNull()
  expect(h.captures()).toBe(1)
  h.result(0, first)
  await flush()
  expect(h.captures()).toBe(2)
})
test("worker errors clear evidence and retry starts a fresh worker", async () => {
  const h = harness()
  h.reply(0, { type: "ready" })
  await flush()
  h.result()
  h.reply(0, { type: "error", error: "Scene canvas could not be read" })
  expect(h.tracker.getSnapshot()).toMatchObject({
    status: "error",
    error: "Scene canvas could not be read",
    marker: null,
  })
  h.tracker.start()
  expect(h.workers).toHaveLength(2)
  expect(h.tracker.getSnapshot()).toMatchObject({
    status: "loading",
    error: "",
  })
})
test("unreadable worker messages report a recoverable error", () => {
  const h = harness()
  h.workers[0].onmessageerror?.()
  expect(h.tracker.getSnapshot().status).toBe("error")
  expect(h.tracker.getSnapshot().error).toMatch(/unreadable|retry/i)
})
test("large raw canvas is downscaled without changing original scene dimensions", async () => {
  const original = globalThis.createImageBitmap
  let received: ImageBitmapOptions | undefined
  globalThis.createImageBitmap = (async (
    _image: ImageBitmapSource,
    options: ImageBitmapOptions
  ) => {
    received = options
    return { close() {} } as ImageBitmap
  }) as typeof createImageBitmap
  try {
    const h = harness(false, true)
    h.reply(0, { type: "ready" })
    await flush()
    expect(received?.resizeWidth).toBe(960)
    expect(received?.resizeHeight).toBe(540)
    expect(h.workers[0].messages.at(-1)?.scene).toMatchObject({
      width: 1920,
      height: 1080,
    })
  } finally {
    globalThis.createImageBitmap = original
  }
})

test("a stalled camera cannot make an old worker result look fresh", async () => {
  const h = harness()
  h.reply(0, { type: "ready" })
  await flush()
  await Bun.sleep(280)
  h.result()
  expect(h.tracker.getSnapshot().marker).toBeNull()
})
