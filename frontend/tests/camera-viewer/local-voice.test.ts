import { expect, test } from "bun:test"
import { LocalVoiceController } from "../../apps/web/src/features/camera-viewer/local-voice"
import type { VoiceSessionFactory } from "../../apps/web/src/features/camera-viewer/local-voice.types"

function fixture() {
  let stopped = 0
  let deliver: (text: string) => void = () => {}
  const factory: VoiceSessionFactory = async (handler) => {
    deliver = handler
    return {
      stop() {
        stopped++
      },
    }
  }
  return {
    factory,
    emit: (text: string) => deliver(text),
    stopped: () => stopped,
  }
}

test("voice uses the app recognizer without browser language-pack installation", async () => {
  const fake = fixture()
  const voice = new LocalVoiceController(fake.factory)
  const heard: string[] = []
  await voice.start((text) => heard.push(text))
  expect(voice.getSnapshot().status).toBe("listening")
  fake.emit("scene camera")
  expect(heard).toEqual(["scene camera"])
  voice.dispose()
  expect(fake.stopped()).toBe(1)
})

test("stop cancels pending startup and releases late resources", async () => {
  let release!: (session: { stop(): void }) => void
  let stopped = 0
  let signal!: AbortSignal
  const voice = new LocalVoiceController((_handler, abort) => {
    signal = abort
    return new Promise((resolve) => {
      release = resolve
    })
  })
  const pending = voice.start(() => {})
  voice.stop()
  expect(signal.aborted).toBe(true)
  release({
    stop() {
      stopped++
    },
  })
  await pending
  expect(stopped).toBe(1)
  expect(voice.getSnapshot().status).toBe("idle")
})

test("voice ignores callbacks from a stopped session", async () => {
  const fake = fixture()
  const voice = new LocalVoiceController(fake.factory)
  const heard: string[] = []
  await voice.start((text) => heard.push(text))
  voice.stop()
  fake.emit("stop cameras")
  expect(heard).toEqual([])
})

test("model and microphone failures are retryable with the same Voice button", async () => {
  let attempts = 0
  const voice = new LocalVoiceController(async () => {
    attempts++
    if (attempts === 1) throw new DOMException("denied", "NotAllowedError")
    return { stop() {} }
  })
  await voice.start(() => {})
  expect(voice.getSnapshot().status).toBe("error")
  expect(voice.getSnapshot().message).toMatch(/microphone/i)
  await voice.start(() => {})
  expect(voice.getSnapshot().status).toBe("listening")
  voice.dispose()
})

test("repeated start does not open multiple microphone sessions", async () => {
  const fake = fixture()
  const voice = new LocalVoiceController(fake.factory)
  await voice.start(() => {})
  await voice.start(() => {})
  voice.stop()
  expect(fake.stopped()).toBe(1)
})
