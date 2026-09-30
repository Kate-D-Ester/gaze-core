import { afterEach, beforeEach, expect, test } from "bun:test"
import { createSceneRecording } from "../../apps/web/src/features/scene-eye-tracking/recording"
const original = globalThis.MediaRecorder
let last: any, stopped: number
class FakeRecorder {
  static isTypeSupported = (mime: string) => mime.startsWith("video/mp4")
  mimeType: string
  state = "inactive"
  ondataavailable: any
  onstop: any
  onerror: any
  constructor(_stream: unknown, options: { mimeType?: string }) {
    this.mimeType = options.mimeType || "video/mp4"
    last = this
  }
  start() {
    this.state = "recording"
  }
  stop() {
    if (this.state === "inactive") throw new Error("already stopped")
    this.state = "inactive"
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["last"]) })
      this.onstop?.()
    })
  }
}
const canvas = () =>
  ({
    captureStream: () => ({ getTracks: () => [{ stop: () => stopped++ }] }),
  }) as unknown as HTMLCanvasElement
beforeEach(() => {
  globalThis.MediaRecorder = FakeRecorder as any
  stopped = 0
})
afterEach(() => {
  globalThis.MediaRecorder = original
})
test("selects a supported codec, finalizes concurrent stop once, and releases recording tracks", async () => {
  const r = createSceneRecording(canvas())
  r.start()
  last.ondataavailable({ data: new Blob(["first"]) })
  const a = r.stop(),
    b = r.stop(),
    result = await a
  expect(await b).toBe(result)
  expect(await result.blob.text()).toBe("firstlast")
  expect(result.extension).toBe("mp4")
  expect(result.mimeType).toBe("video/mp4")
  expect(stopped).toBe(1)
  r.dispose()
  expect(result.blob.size).toBe(9)
})
test("recorder failure preserves partial raw video and a readable error", async () => {
  const r = createSceneRecording(canvas())
  r.start()
  last.ondataavailable({ data: new Blob(["partial"]) })
  last.onerror({ error: new Error("Encoder stopped") })
  const result = await r.stop()
  expect(result.error).toContain("Encoder stopped")
  expect(await result.blob.text()).toBe("partiallast")
})
test("size limit finalizes bounded data and notifies the session", async () => {
  let limited = false
  const r = createSceneRecording(canvas(), {
    maxBytes: 10,
    onLimit: () => {
      limited = true
    },
  })
  r.start()
  last.ondataavailable({ data: new Blob(["12345"]) })
  last.ondataavailable({ data: new Blob(["1234567"]) })
  const result = await r.stop()
  expect(limited).toBe(true)
  expect(result.blob.size).toBeLessThanOrEqual(10)
  expect(result.error).toContain("limit")
})
test("unsupported recording and canvas capture return clear failure", () => {
  globalThis.MediaRecorder = undefined as any
  expect(() => createSceneRecording(canvas()).start()).toThrow("record")
  globalThis.MediaRecorder = FakeRecorder as any
  expect(() => createSceneRecording({} as HTMLCanvasElement).start()).toThrow(
    "capture"
  )
})

test("startup encoder failure releases capture without reporting a completed recording", () => {
  let completed = 0
  globalThis.MediaRecorder = class extends FakeRecorder {
    start() {
      throw new Error("Encoder unavailable")
    }
  } as any
  const r = createSceneRecording(canvas(), { onStopped: () => completed++ })
  expect(() => r.start()).toThrow("Encoder unavailable")
  r.dispose()
  expect(stopped).toBe(1)
  expect(completed).toBe(0)
})
