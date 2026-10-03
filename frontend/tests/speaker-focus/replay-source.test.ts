import { expect, test } from "bun:test"
import { ReplaySource } from "../../apps/web/src/features/speaker-focus/replay-source"
import type { ReplaySourceOptions } from "../../apps/web/src/features/speaker-focus/replay-source.types"
function fixture(overrides: Partial<ReplaySourceOptions> = {}) {
  let callback: VideoFrameRequestCallback | null = null
  const video = Object.assign(new EventTarget(), {
    videoWidth: 8,
    videoHeight: 8,
    duration: 1.0001875,
    readyState: 4,
    currentTime: 0,
    muted: false,
    playsInline: false,
    src: "",
    play: async () => {},
    pause() {},
    load() {},
    removeAttribute() {},
    requestVideoFrameCallback: (fn: VideoFrameRequestCallback) => {
      callback = fn
      return 1
    },
    cancelVideoFrameCallback() {},
  }) as unknown as HTMLVideoElement
  const audio: { start: number; pcm: Float32Array }[] = []
  let ended = -1
  let revoked = 0
  const pcm = Float32Array.from({ length: 16003 }, (_, i) => i / 32006)
  const source = new ReplaySource({
    generation: () => 1,
    now: () => 100,
    onAudio: (event) =>
      audio.push({ start: event.startSample, pcm: event.pcm }),
    onFrame() {},
    onEnd: (end) => {
      ended = end
    },
    onError() {},
    videoFactory: () => video,
    canvasFactory: () =>
      ({
        getContext: () => ({ drawImage() {} }),
        toBlob: (fn: BlobCallback) => fn(new Blob(["jpeg"])),
      }) as unknown as HTMLCanvasElement,
    createUrl: () => "blob:test",
    revokeUrl: () => revoked++,
    decode: async () =>
      ({
        sampleRate: 16000,
        numberOfChannels: 1,
        length: pcm.length,
        getChannelData: () => pcm,
      }) as unknown as AudioBuffer,
    ...overrides,
  })
  const frame = async (time: number) => {
    Object.assign(video, { currentTime: time })
    callback?.(100, { mediaTime: time } as VideoFrameCallbackMetadata)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return {
    source,
    audio,
    frame,
    video,
    pcm,
    ended: () => ended,
    revoked: () => revoked,
  }
}
test("only elapsed mixed samples are emitted; flow pause preserves exact cursor and EOF", async () => {
  const f = fixture()
  const abort = new AbortController()
  await f.source.load(new File(["mixed"], "reference.mp4"), abort.signal)
  await f.source.play()
  await f.frame(0.4)
  expect(
    f.audio.every((packet) => packet.start + packet.pcm.length <= 6400)
  ).toBe(true)
  expect(f.audio.every((packet) => packet.pcm.length <= 3200)).toBe(true)
  f.source.setFlow(true)
  await f.frame(0.5)
  expect(f.source.position).toBe(6400)
  f.source.setFlow(false)
  await f.frame(0.7)
  f.video.dispatchEvent(new Event("ended"))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.ended()).toBe(f.pcm.length)
  const joined = Float32Array.from(f.audio.flatMap((packet) => [...packet.pcm]))
  expect([...joined]).toEqual([...f.pcm])
  f.source.dispose()
  expect(f.revoked()).toBe(1)
})
test("unsupported decode and cancellation release the source URL", async () => {
  const f = fixture()
  const abort = new AbortController()
  abort.abort()
  await expect(
    f.source.load(new File(["mixed"], "reference.mp4"), abort.signal)
  ).rejects.toThrow()
  f.source.dispose()
  expect(f.audio.length).toBe(0)
})

test("a generation change during JPEG encoding cannot emit old-generation source audio", async () => {
  let generation = 1
  let release: BlobCallback | null = null
  let encodes = 0
  const f = fixture({
    generation: () => generation,
    canvasFactory: () =>
      ({
        getContext: () => ({ drawImage() {} }),
        toBlob: (callback: BlobCallback) => {
          if (++encodes === 1) {
            callback(new Blob(["jpeg"]))
          } else {
            release = callback
          }
        },
      }) as unknown as HTMLCanvasElement,
  })
  await f.source.load(
    new File(["mixed"], "reference.mp4"),
    new AbortController().signal
  )
  await f.source.play()
  await f.frame(0.4)
  generation++
  if (release) {
    ;(release as BlobCallback)(new Blob(["late"]))
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.audio.length).toBe(0)
  f.source.dispose()
})
test("cancelling a pending native decode immediately revokes its object URL", async () => {
  let finish: (buffer: AudioBuffer) => void = () => {}
  const f = fixture({
    decode: () =>
      new Promise<AudioBuffer>((resolve) => {
        finish = resolve
      }),
  })
  const abort = new AbortController()
  const pending = f.source.load(
    new File(["mixed"], "reference.mp4"),
    abort.signal
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  abort.abort()
  expect(f.revoked()).toBe(1)
  finish({
    sampleRate: 16000,
    numberOfChannels: 1,
    length: 16003,
    getChannelData: () => f.pcm,
  } as AudioBuffer)
  await expect(pending).rejects.toThrow()
  expect(f.audio.length).toBe(0)
})
