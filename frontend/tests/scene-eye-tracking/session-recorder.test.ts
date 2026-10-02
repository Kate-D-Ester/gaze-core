import { expect, test } from "bun:test"
import { SessionRecorder } from "../../apps/web/src/features/scene-eye-tracking/session-recorder"
import type {
  RecordingController,
  RecordingOptions,
  RecordingResult,
} from "../../apps/web/src/features/scene-eye-tracking/recording"
function fixture(fail = false) {
  let resolveStop: (v: RecordingResult) => void = () => {},
    owned = 0
  const factory = (
    _canvas: HTMLCanvasElement,
    _options: RecordingOptions
  ): RecordingController => ({
    start() {
      if (fail) throw new Error("Video unsupported")
    },
    stop() {
      owned++
      return new Promise((resolve) => {
        resolveStop = resolve
      })
    },
    dispose() {},
  })
  const recorder = new SessionRecorder(factory)
  const canvas = { width: 640, height: 480 } as HTMLCanvasElement
  const finish = () =>
    resolveStop({
      blob: new Blob(["raw-scene"]),
      mimeType: "video/webm",
      extension: "webm",
      startedAt: 1000,
      endedAt: 2000,
      error: "",
      capture: "canvas-reencode",
    })
  return { recorder, canvas, finish, owned: () => owned }
}
test("source failure stops logging immediately and preserves the completed video and original metadata", async () => {
  const f = fixture()
  f.recorder.start(
    f.canvas,
    null,
    { calibration: { model: "affine" } },
    null,
    false
  )
  const log = f.recorder.getSnapshot().log!
  const m = {
    timestamp: log.startedAt + 10,
    eyeId: 1,
    sceneId: 1,
    eyeTimestamp: log.startedAt,
    sceneTimestamp: log.startedAt,
    confidence: 0.9,
    position: [0.5, 0.5] as [number, number],
    pixels: [320, 240] as [number, number],
    valid: true,
    reason: "",
    extrapolated: false,
  }
  f.recorder.observeMeasurement(m)
  const stop = f.recorder.stop("Scene disconnected")
  expect(f.recorder.getSnapshot().recording).toBe(false)
  f.recorder.observeMeasurement({
    ...m,
    timestamp: m.timestamp + 50,
    eyeId: 2,
    sceneId: 2,
  })
  expect(log.measurements).toHaveLength(1)
  f.finish()
  await stop
  expect(await f.recorder.getSnapshot().sceneVideo!.blob.text()).toBe(
    "raw-scene"
  )
  expect(log.metadata.calibration).toEqual({ model: "affine" })
  expect(f.owned()).toBe(1)
  f.recorder.dispose()
})
test("unsupported video retains a bounded coordinate-only recording session", async () => {
  const f = fixture(true)
  f.recorder.start(f.canvas, null, {}, null, false)
  expect(f.recorder.getSnapshot().recording).toBe(true)
  expect(f.recorder.getSnapshot().error).toContain("unsupported")
  await f.recorder.stop()
  expect(f.recorder.getSnapshot().log!.endedAt).not.toBeNull()
  f.recorder.dispose()
})
test("unmount finalizes only owned recorders and does not leak late download URLs", async () => {
  const f = fixture()
  f.recorder.start(f.canvas, null, {}, null, false)
  f.recorder.dispose()
  f.finish()
  await Promise.resolve()
  await Promise.resolve()
  expect(f.owned()).toBe(1)
  expect(f.recorder.getSnapshot().sceneUrl).toBeNull()
})
