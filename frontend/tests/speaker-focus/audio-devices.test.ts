import { expect, test } from "bun:test"
import { AudioDevices } from "../../apps/web/src/features/speaker-focus/audio-devices"
const device = (kind: MediaDeviceKind, deviceId: string, label: string) =>
  ({ kind, deviceId, label, groupId: "group", toJSON() {} }) as MediaDeviceInfo
function fixture() {
  const media = new EventTarget() as MediaDevices
  let devices = [
    device("audioinput", "mic", "USB mic"),
    device("audiooutput", "ears", "Headphones"),
  ]
  let stopped = 0
  let requested = 0
  const storage = new Map<string, string>()
  Object.assign(media, {
    enumerateDevices: async () => devices,
    getUserMedia: async () => {
      requested++
      return {
        getTracks: () => [{ stop: () => stopped++ }],
      } as unknown as MediaStream
    },
  })
  const audio = new AudioDevices({
    media,
    storage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
    outputSupported: true,
  })
  return {
    audio,
    media,
    storage,
    requested: () => requested,
    stopped: () => stopped,
    devices: (value: MediaDeviceInfo[]) => {
      devices = value
    },
  }
}
test("listing devices does not start a microphone; explicit access releases its probe", async () => {
  const f = fixture()
  await f.audio.mount()
  expect(f.requested()).toBe(0)
  expect(f.audio.getSnapshot().inputs[0]?.label).toBe("USB mic")
  await f.audio.enable()
  expect(f.requested()).toBe(1)
  expect(f.stopped()).toBe(1)
  f.audio.dispose()
})
test("device selections survive remount and a missing mic never silently becomes the default", async () => {
  const f = fixture()
  await f.audio.mount()
  f.audio.setMicrophone("mic")
  await f.audio.setOutput("ears", async () => {})
  f.audio.dispose()
  await f.audio.mount()
  expect(f.audio.getSnapshot().selection).toEqual({
    microphoneId: "mic",
    outputId: "ears",
  })
  f.devices([device("audiooutput", "ears", "Headphones")])
  f.media.dispatchEvent(new Event("devicechange"))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.audio.getSnapshot().inputMissing).toBe(true)
  expect(f.audio.getSnapshot().selection.microphoneId).toBe("mic")
  f.audio.dispose()
})
test("failed output routing keeps the previous choice and shows the failure", async () => {
  const f = fixture()
  await f.audio.mount()
  await f.audio.setOutput("ears", async () => {
    throw new Error("Headphones unavailable")
  })
  expect(f.audio.getSnapshot().selection.outputId).toBe("")
  expect(f.audio.getSnapshot().error).toContain("Headphones unavailable")
  f.audio.dispose()
})
test("permission resolving after disposal releases the probe without publishing devices", async () => {
  const f = fixture()
  let release: (stream: MediaStream) => void = () => {}
  Object.assign(f.media, {
    getUserMedia: () =>
      new Promise<MediaStream>((resolve) => {
        release = resolve
      }),
  })
  await f.audio.mount()
  const pending = f.audio.enable()
  f.audio.dispose()
  let stopped = 0
  release({
    getTracks: () => [{ stop: () => stopped++ }],
  } as unknown as MediaStream)
  await pending
  expect(stopped).toBe(1)
})

test("visible camera labels do not mark saved audio devices disconnected before audio permission", async () => {
  const f = fixture()
  await f.audio.mount()
  f.audio.setMicrophone("mic")
  await f.audio.setOutput("ears", async () => {})
  f.audio.dispose()
  f.devices([
    device("videoinput", "camera", "Scene camera"),
    device("audioinput", "", ""),
    device("audiooutput", "", ""),
  ])
  await f.audio.mount()
  expect(f.audio.getSnapshot().inputMissing).toBe(false)
  expect(f.audio.getSnapshot().outputMissing).toBe(false)
  expect(f.audio.getSnapshot().selection).toEqual({
    microphoneId: "mic",
    outputId: "ears",
  })
  f.audio.dispose()
})
