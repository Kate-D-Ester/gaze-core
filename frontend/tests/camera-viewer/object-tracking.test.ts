import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
import { expect, test } from "bun:test"
import { ObjectTracking } from "../../apps/web/src/features/camera-viewer/object-tracking"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import { liveSnapshot } from "./fixtures"
import type {
  VisionRecord,
  VisionRequest,
} from "../../apps/web/src/features/camera-viewer/object-tracking.types"

function camera() {
  const camera = new SceneCamera()
  const snapshot = liveSnapshot()
  camera.getSnapshot = () => snapshot
  snapshot.frame!.timestamp = 100
  return { camera, snapshot }
}
const selected = {
  token: "example-token",
  box: [0.1, 0.2, 0.4, 0.6],
  label: "Bottle",
}
const matched = {
  status: "matched",
  box: [0.6, 0.3, 0.9, 0.7],
  score: 0.91,
  inliers: 18,
  detectionConfidence: 0.82,
}
function deferred() {
  let resolve!: (value: VisionRecord) => void
  return {
    promise: new Promise<VisionRecord>((accept) => {
      resolve = accept
    }),
    resolve: (value: VisionRecord) => resolve(value),
  }
}

test("select captures Scene and matches only the actual auxiliary result without Eye", async () => {
  const scene = camera(),
    auxiliary = camera()
  const tracker = new ObjectTracking({
    encode: () => "jpeg",
    now: () => 100,
    request: async (request) =>
      request.action === "select" ? selected : matched,
  })
  await tracker.select(scene.camera, { point: [0.25, 0.4] })
  expect(tracker.getSnapshot().status).toBe("searching")
  expect(tracker.getSnapshot().reference?.box).toEqual([0.1, 0.2, 0.4, 0.6])
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(tracker.getSnapshot().match?.box).toEqual([0.6, 0.3, 0.9, 0.7])
  expect(tracker.getSnapshot().status).toBe("matched")
  tracker.clear()
})
test("clear during pending selection cleans its late token without restoring a reference", async () => {
  const source = camera(),
    pending = deferred(),
    actions: VisionRequest[] = []
  const tracker = new ObjectTracking({
    encode: () => "jpeg",
    now: () => 100,
    request: async (request) => {
      actions.push(request)
      return request.action === "select" ? pending.promise : {}
    },
  })
  const selecting = tracker.select(source.camera, { point: [0.2, 0.3] })
  await Promise.resolve()
  tracker.clear()
  pending.resolve(selected)
  await selecting
  expect(tracker.getSnapshot().status).toBe("idle")
  expect(tracker.getSnapshot().reference).toBeNull()
  expect(
    actions.some(
      (request) =>
        request.action === "clear" && request.token === "example-token"
    )
  ).toBe(true)
  tracker.clear()
})
test("matching has backpressure and cannot resurrect a box after clear", async () => {
  const scene = camera(),
    auxiliary = camera(),
    pending = deferred()
  let calls = 0
  const tracker = new ObjectTracking({
    encode: () => "jpeg",
    now: () => 100,
    request: async (request) => {
      if (request.action === "select") {
        return selected
      }
      if (request.action === "match") {
        calls++
        return pending.promise
      }
      return {}
    },
  })
  await tracker.select(scene.camera, { point: [0.2, 0.3] })
  const first = tracker.tick(scene.camera, auxiliary.camera)
  await Promise.resolve()
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(calls).toBe(1)
  tracker.clear()
  pending.resolve(matched)
  await first
  expect(tracker.getSnapshot().match).toBeNull()
  expect(tracker.getSnapshot().status).toBe("idle")
  tracker.clear()
})
test("same-source frame gaps resume while Scene generation changes invalidate the reference", async () => {
  const scene = camera(),
    auxiliary = camera()
  let now = 100
  const tracker = new ObjectTracking({
    encode: () => "jpeg",
    now: () => now,
    request: async (request) =>
      request.action === "select" ? selected : matched,
  })
  await tracker.select(scene.camera, { box: [0.1, 0.2, 0.4, 0.6] })
  await tracker.tick(scene.camera, auxiliary.camera)
  now = 1500
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(tracker.getSnapshot().match).toBeNull()
  expect(tracker.getSnapshot().reference?.label).toBe("Bottle")
  scene.snapshot.frame!.timestamp = auxiliary.snapshot.frame!.timestamp = now
  auxiliary.snapshot.frame!.id++
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(tracker.getSnapshot().status).toBe("matched")
  scene.snapshot.frame!.generation++
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(tracker.getSnapshot().reference).toBeNull()
  tracker.clear()
})
test("a score at 80 percent and malformed geometry never create a matched overlay", async () => {
  const scene = camera(),
    auxiliary = camera()
  const tracker = new ObjectTracking({
    encode: () => "jpeg",
    now: () => 100,
    request: async (request) =>
      request.action === "select" ? selected : { ...matched, score: 0.8 },
  })
  await tracker.select(scene.camera, { point: [0.2, 0.3] })
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(tracker.getSnapshot().match).toBeNull()
  expect(tracker.getSnapshot().status).toBe("error")
  tracker.clear()
})

test("a failed response from an old auxiliary source cannot stop tracking its replacement", async () => {
  const scene = camera(),
    auxiliary = camera()
  let fail!: (error: Error) => void
  let calls = 0
  const tracker = new ObjectTracking({
    encode: () => "jpeg",
    now: () => 100,
    request: async (request) => {
      if (request.action === "select") {
        return selected
      }
      if (request.action === "match") {
        calls++
        if (calls === 1) {
          return new Promise((_, reject) => {
            fail = reject
          })
        }
        return matched
      }
      return {}
    },
  })
  await tracker.select(scene.camera, { point: [0.2, 0.3] })
  const pending = tracker.tick(scene.camera, auxiliary.camera)
  await Promise.resolve()
  auxiliary.snapshot.source!.key = "replacement"
  fail(new Error("Old source failed"))
  await pending
  expect(tracker.getSnapshot().status).not.toBe("error")
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(tracker.getSnapshot().match?.sourceKey).toBe("replacement")
  tracker.clear()
})
test("rotation while Scene has no frame clears its old visual reference", async () => {
  const scene = camera(),
    auxiliary = camera()
  const tracker = new ObjectTracking({
    encode: () => "jpeg",
    now: () => 100,
    request: async (request) =>
      request.action === "select" ? selected : matched,
  })
  await tracker.select(scene.camera, { point: [0.2, 0.3] })
  scene.snapshot.transform = { ...scene.snapshot.transform, rotation: 90 }
  scene.snapshot.frame = null
  await tracker.tick(scene.camera, auxiliary.camera)
  expect(tracker.getSnapshot().reference).toBeNull()
  expect(tracker.getSnapshot().match).toBeNull()
  tracker.clear()
})
