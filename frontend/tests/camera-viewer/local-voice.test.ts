import { expect, test } from "bun:test"
import { LocalVoiceController } from "../../apps/web/src/features/camera-viewer/local-voice"
import type {
  LocalRecognition,
  LocalRecognitionConstructor,
  VoiceResultEvent,
} from "../../apps/web/src/features/camera-viewer/local-voice.types"

function speech(available = "available") {
  const instances: LocalRecognition[] = []
  let starts = 0
  let aborted = 0
  class Recognition implements LocalRecognition {
    static available = async (options: unknown) => {
      expect(options).toEqual({ langs: ["en-US"], processLocally: true })
      return available
    }
    static install = async () => true
    processLocally = false
    lang = ""
    continuous = false
    interimResults = true
    onresult: LocalRecognition["onresult"] = null
    onerror: LocalRecognition["onerror"] = null
    onstart: LocalRecognition["onstart"] = null
    onend: LocalRecognition["onend"] = null
    constructor() {
      instances.push(this)
    }
    start() {
      starts++
      this.onstart?.()
    }
    abort() {
      aborted++
      this.onend?.()
    }
  }
  return {
    factory: () => Recognition as unknown as LocalRecognitionConstructor,
    instances,
    started: () => starts,
    aborted: () => aborted,
  }
}

test("local voice requires on-device support and never starts a legacy remote-only recognizer", async () => {
  const supported = speech()
  const factory = supported.factory()!
  delete (factory.prototype as LocalRecognition).processLocally
  const legacy = class extends factory {
    constructor() {
      super()
      delete this.processLocally
    }
  }
  const voice = new LocalVoiceController(() => legacy)
  await voice.start(() => {})
  expect(voice.getSnapshot().status).toBe("unavailable")
  expect(supported.started()).toBe(0)
})

test("local voice dispatches final results once and ignores interim or repeated results", async () => {
  const fake = speech()
  const voice = new LocalVoiceController(fake.factory)
  const heard: string[] = []
  await voice.start((text) => heard.push(text))
  expect(voice.getSnapshot().status).toBe("listening")
  const recognizer = fake.instances[0]!
  expect(recognizer.processLocally).toBe(true)
  const final: VoiceResultEvent = {
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "select" } }],
  }
  recognizer.onresult?.({
    resultIndex: 0,
    results: [{ isFinal: false, 0: { transcript: "take photo" } }],
  })
  recognizer.onresult?.(final)
  recognizer.onresult?.(final)
  expect(heard).toEqual(["select"])
  voice.dispose()
  expect(fake.aborted()).toBe(1)
})

test("unavailable local language packs do not trigger an automatic install or microphone start", async () => {
  const fake = speech("downloadable")
  const voice = new LocalVoiceController(fake.factory)
  await voice.start(() => {})
  expect(voice.getSnapshot().canInstall).toBe(true)
  expect(fake.started()).toBe(0)
})

test("disposing while checking language availability cancels late microphone startup", async () => {
  const fake = speech()
  let release!: (value: "available") => void
  fake.factory()!.available = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const voice = new LocalVoiceController(fake.factory)
  const pending = voice.start(() => {})
  voice.dispose()
  release("available")
  await pending
  expect(fake.started()).toBe(0)
})

test("a refused language installation stays retryable without starting the microphone", async () => {
  const fake = speech("downloadable")
  fake.factory()!.install = async () => false
  const voice = new LocalVoiceController(fake.factory)
  await voice.start(() => {})
  await voice.install()
  expect(voice.getSnapshot().status).toBe("error")
  expect(voice.getSnapshot().canInstall).toBe(true)
  expect(voice.getSnapshot().message).toMatch(/browser.*offline.*model/i)
  expect(fake.started()).toBe(0)

  fake.factory()!.install = async () => true
  await voice.install()
  expect(voice.getSnapshot().status).toBe("idle")
  expect(voice.getSnapshot().canInstall).toBe(false)
  expect(fake.started()).toBe(0)
  fake.factory()!.available = async () => "available"
  await voice.start(() => {})
  expect(fake.started()).toBe(1)
  voice.dispose()
})

test("an in-progress browser language download can be completed explicitly", async () => {
  const fake = speech("downloading")
  const voice = new LocalVoiceController(fake.factory)
  await voice.start(() => {})
  expect(voice.getSnapshot().canInstall).toBe(true)
  expect(voice.getSnapshot().message).toMatch(/already downloading/i)
  await voice.install()
  expect(voice.getSnapshot().status).toBe("idle")
  expect(fake.started()).toBe(0)
  voice.dispose()
})

test("browser policy rejection is explained separately from microphone permission", async () => {
  const fake = speech("downloadable")
  fake.factory()!.install = async () => {
    throw new DOMException("Policy blocked installation", "NotAllowedError")
  }
  const voice = new LocalVoiceController(fake.factory)
  await voice.start(() => {})
  await voice.install()
  expect(voice.getSnapshot().message).toMatch(/browser blocked offline voice/i)
  expect(voice.getSnapshot().canInstall).toBe(false)
  expect(fake.started()).toBe(0)
  voice.dispose()
})

test("leaving during an installation ignores its late completion", async () => {
  const fake = speech("downloadable")
  let release!: (installed: boolean) => void
  fake.factory()!.install = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const voice = new LocalVoiceController(fake.factory)
  await voice.start(() => {})
  const installation = voice.install()
  voice.dispose()
  release(false)
  await installation
  expect(voice.getSnapshot().status).toBe("idle")
  expect(voice.getSnapshot().canInstall).toBe(false)
})
