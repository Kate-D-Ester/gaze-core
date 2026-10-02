import { afterEach, expect, test } from "bun:test"
import { HandTracker } from "../../apps/web/src/features/scene-eye-tracking/hand-tracker"
import type { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
let trackers: HandTracker[] = []
afterEach(() => {
  trackers.forEach((t) => t.dispose())
  trackers = []
})
function harness(useBrowserBitmap = false) {
  let callback = () => {},
    closed = 0,
    terminated = 0,
    createCount = 0
  const messages: any[] = [],
    workers: any[] = []
  const camera = {
    rawCanvas: {},
    latest: {
      id: 1,
      timestamp: performance.now(),
      width: 640,
      height: 480,
      generation: 1,
    },
    subscribe(fn: () => void) {
      callback = fn
      return () => {
        callback = () => {}
      }
    },
  } as unknown as SceneCamera
  const factory = () => {
    const w = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: (m: any) => messages.push(m),
      terminate: () => terminated++,
    }
    workers.push(w)
    return w as unknown as Worker
  }
  const bitmap = async () => {
    createCount++
    return { close: () => closed++ } as ImageBitmap
  }
  const t = new HandTracker(
    camera,
    factory,
    useBrowserBitmap ? undefined : bitmap
  )
  trackers.push(t)
  t.start()
  const worker = workers[0]
  const reply = (data: any) =>
    worker.onmessage({ data: { generation: messages[0].generation, ...data } })
  return {
    t,
    camera,
    messages,
    workers,
    reply,
    tick: () => callback(),
    closed: () => closed,
    terminated: () => terminated,
    created: () => createCount,
  }
}
const handJoints = (offset = 0) =>
  Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + offset + (i % 4) * 0.02,
    y: 0.5 + Math.floor(i / 4) * 0.02,
    z: 0,
  }))
async function replyHand(
  h: ReturnType<typeof harness>,
  id: number,
  joints = handJoints(),
  gap = 33
) {
  const previous = h.camera.latest!
  h.camera.latest = { ...previous, id, timestamp: previous.timestamp + gap }
  h.tick()
  await Promise.resolve()
  h.reply({
    type: "result",
    scene: h.camera.latest,
    landmarks: [joints],
    worldLandmarks: [joints],
    handedness: ["Right"],
  })
}
test("an isolated fingertip jump pauses raw evidence and cannot contaminate calibration", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  await replyHand(h, 1)
  const spike = handJoints()
  spike[8].x += 0.3
  await replyHand(h, 2, spike)
  expect(h.t.getSnapshot().hand?.landmarks).toHaveLength(0)
  expect(h.t.getSnapshot().previewHand?.scene.id).toBe(1)
  await replyHand(h, 3)
  expect(h.t.getSnapshot().hand?.landmarks[0][8].x).toBe(0.5)
})
test("preview smoothing reduces small jitter without altering accepted raw fingertip coordinates", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  await replyHand(h, 1)
  await replyHand(h, 2, handJoints(0.008))
  const state = h.t.getSnapshot()
  expect(state.hand?.landmarks[0][8].x).toBe(0.508)
  expect(state.previewHand?.landmarks[0][8].x).toBeGreaterThan(0.5)
  expect(state.previewHand?.landmarks[0][8].x).toBeLessThan(0.508)
  expect(state.previewHand?.scene.id).toBe(2)
})
test("confirmed hand movement and reacquisition reset the preview instead of lagging behind", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  await replyHand(h, 1)
  await replyHand(h, 2, handJoints(0.25))
  expect(h.t.getSnapshot().hand?.landmarks).toHaveLength(0)
  await replyHand(h, 3, handJoints(0.25))
  expect(h.t.getSnapshot().hand?.landmarks[0][8].x).toBe(0.75)
  expect(h.t.getSnapshot().previewHand?.landmarks[0][8].x).toBe(0.75)
  await replyHand(h, 4, handJoints(), 400)
  expect(h.t.getSnapshot().previewHand?.landmarks[0][8].x).toBe(0.5)
})
test("large scene frames are resized for inference without changing scene coordinates", async () => {
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
    const h = harness(true)
    h.camera.rawCanvas.width = 1920
    h.camera.rawCanvas.height = 1080
    h.camera.latest = { ...h.camera.latest!, width: 1920, height: 1080 }
    h.reply({ type: "ready" })
    await Promise.resolve()
    expect(received?.resizeWidth).toBe(640)
    expect(received?.resizeHeight).toBe(360)
    expect(h.messages.at(-1).scene.width).toBe(1920)
  } finally {
    globalThis.createImageBitmap = original
  }
})
test("one hand request in flight and each scene frame is processed once", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  h.tick()
  h.tick()
  await Promise.resolve()
  expect(h.created()).toBe(1)
  expect(h.messages.filter((m) => m.type === "frame")).toHaveLength(1)
  const frame = h.messages.at(-1)
  h.reply({
    type: "result",
    scene: frame.scene,
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
  })
  h.tick()
  await Promise.resolve()
  expect(h.created()).toBe(1)
  h.camera.latest = { ...h.camera.latest!, id: 2 }
  h.tick()
  await Promise.resolve()
  expect(h.created()).toBe(2)
})
test("finishing inference immediately processes the newest waiting frame", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  await Promise.resolve()
  const first = h.messages.at(-1)
  h.camera.latest = { ...h.camera.latest!, id: 2 }
  h.tick()
  h.camera.latest = { ...h.camera.latest!, id: 3 }
  h.tick()
  h.reply({
    type: "result",
    scene: first.scene,
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
  })
  await Promise.resolve()
  expect(
    h.messages.filter((m) => m.type === "frame").map((m) => m.scene.id)
  ).toEqual([1, 3])
})
test("bounded hand reacquisition keeps only a dimmed preview, not calibration evidence", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  await Promise.resolve()
  const scene = h.messages.at(-1).scene
  const landmarks = [
    Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
  ]
  h.reply({
    type: "result",
    scene,
    landmarks,
    worldLandmarks: [],
    handedness: ["Right"],
  })
  h.camera.latest = { ...scene, id: 2, timestamp: scene.timestamp + 50 }
  h.tick()
  await Promise.resolve()
  h.reply({
    type: "result",
    scene: h.camera.latest,
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
  })
  const state = h.t.getSnapshot()
  expect(state.hand?.landmarks).toHaveLength(0)
  expect(state.previewHand?.scene.id).toBe(1)
  h.camera.latest = { ...scene, id: 3, timestamp: scene.timestamp + 500 }
  h.tick()
  await Promise.resolve()
  h.reply({
    type: "result",
    scene: h.camera.latest,
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
  })
  expect(h.t.getSnapshot().previewHand?.scene.id).toBe(1)
  expect(h.t.getSnapshot().hand?.landmarks).toHaveLength(0)
  h.camera.latest = { ...scene, id: 4, timestamp: scene.timestamp + 3100 }
  h.tick()
  await Promise.resolve()
  h.reply({
    type: "result",
    scene: h.camera.latest,
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
  })
  expect(h.t.getSnapshot().previewHand).toBeNull()
})
test("source-generation changes discard pending bitmap creation and stale results", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  h.tick()
  h.camera.latest = { ...h.camera.latest!, generation: 2 }
  await Promise.resolve()
  expect(h.closed()).toBe(1)
  h.reply({
    type: "result",
    scene: { ...h.camera.latest!, generation: 1 },
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
  })
  expect(h.t.getSnapshot().hand).toBeNull()
})
test("model load failure is readable and retry creates a fresh worker", () => {
  const h = harness()
  h.reply({ type: "error", error: "Model asset missing" })
  expect(h.t.getSnapshot().status).toBe("error")
  expect(h.t.getSnapshot().error).toContain("Model asset missing")
  h.t.start()
  expect(h.workers).toHaveLength(2)
  expect(h.terminated()).toBe(1)
  h.reply({ type: "ready" })
  expect(h.t.getSnapshot().status).toBe("loading")
})
test("disposing releases worker and prevents pending images from being transferred", async () => {
  const h = harness()
  h.reply({ type: "ready" })
  h.tick()
  h.t.dispose()
  await Promise.resolve()
  expect(h.closed()).toBe(1)
  expect(h.terminated()).toBe(1)
  expect(h.messages.filter((m) => m.type === "frame")).toHaveLength(0)
})
