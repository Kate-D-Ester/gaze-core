import { expect, test } from "bun:test"
import { ReplaySource } from "../../apps/web/src/features/speaker-focus/replay-source"
import type { ReplaySourceOptions } from "../../apps/web/src/features/speaker-focus/replay-source.types"
function fixture(
  overrides: Partial<ReplaySourceOptions> = {},
  seekDelay = 0,
  sampleCount = 16003
) {
  let currentTime = 0
  let started: number | null = null
  let nativePlays = 0
  const video = Object.assign(new EventTarget(), {
    videoWidth: 8,
    videoHeight: 8,
    duration: sampleCount / 16000,
    readyState: 4,
    muted: false,
    playsInline: false,
    src: "",
    play: async () => {
      nativePlays++
      started ??= performance.now()
    },
    pause() {
      if (started !== null) {
        currentTime = Math.min(
          sampleCount / 16000,
          currentTime + (performance.now() - started) / 1000
        )
        started = null
      }
    },
    load() {},
    removeAttribute() {},
  }) as unknown as HTMLVideoElement
  Object.defineProperty(video, "currentTime", {
    get: () =>
      Math.min(
        sampleCount / 16000,
        currentTime +
          (started === null ? 0 : (performance.now() - started) / 1000)
      ),
    set: (value: number) => {
      currentTime = value
      if (started !== null) {
        started = performance.now()
      }
      setTimeout(() => video.dispatchEvent(new Event("seeked")), seekDelay)
    },
  })
  const audio: { start: number; pcm: Float32Array; generation: number }[] = []
  let ended = -1
  let revoked = 0
  const pcm = Float32Array.from({ length: sampleCount }, (_, i) => i / 32006)
  const source = new ReplaySource({
    generation: () => 1,
    onAudio: (event) =>
      audio.push({
        start: event.startSample,
        pcm: event.pcm,
        generation: event.generation,
      }),
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
  return {
    source,
    audio,
    video,
    pcm,
    ended: () => ended,
    revoked: () => revoked,
    nativePlays: () => nativePlays,
  }
}
async function until(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5000
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Replay did not reach the expected position")
    }
    await Bun.sleep(5)
  }
}
function expectExactAudio(f: ReturnType<typeof fixture>): void {
  let cursor = 0
  let exact = true
  for (const packet of f.audio) {
    expect(packet.start).toBe(cursor)
    expect(packet.pcm.length).toBeLessThanOrEqual(3200)
    exact &&= packet.pcm.every(
      (value, index) => value === f.pcm[cursor + index]
    )
    cursor += packet.pcm.length
  }
  expect(cursor).toBe(f.pcm.length)
  expect(exact).toBe(true)
}
test("reference input follows native video time and retains exact audio through EOF", async () => {
  const f = fixture()
  try {
    await f.source.load(
      new File(["mixed"], "reference.mp4"),
      new AbortController().signal
    )
    await f.source.play()
    await until(() => f.audio.length > 0)
    const position = f.source.position
    expect(
      f.audio.every((packet) => packet.start + packet.pcm.length <= position)
    ).toBe(true)
    await Bun.sleep(120)
    expect(f.source.position).toBeGreaterThan(position)
    expect(f.nativePlays()).toBe(1)
    await until(() => f.ended() === f.pcm.length)
    expectExactAudio(f)
  } finally {
    f.source.dispose()
  }
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
  await until(() => release !== null)
  generation++
  f.source.pause()
  if (release) {
    ;(release as BlobCallback)(new Blob(["late"]))
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  const sentBeforeChange = f.audio.length
  await Bun.sleep(40)
  expect(f.audio.length).toBe(sentBeforeChange)
  expect(f.audio.every((event) => event.generation === 1)).toBe(true)
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

test("an explicit seek resumes contiguous audio from its requested source position", async () => {
  const f = fixture()
  try {
    await f.source.load(
      new File(["mixed"], "reference.mp4"),
      new AbortController().signal
    )
    await f.source.seek(0)
    await f.source.play()
    await until(() => f.audio.length > 0)
    expect(f.audio[0]?.start).toBe(0)
  } finally {
    f.source.dispose()
  }
})
test("paced replay stays within transport limits while retaining every mixed sample", async () => {
  const frames: number[] = []
  const f = fixture({
    onFrame: (event) => {
      frames.push(event.sample)
    },
  })
  try {
    await f.source.load(
      new File(["mixed"], "reference.mp4"),
      new AbortController().signal
    )
    await f.source.play()
    await until(() => f.ended() === f.pcm.length)
    expect(frames.length + f.audio.length).toBeLessThan(80)
    for (let index = 1; index < frames.length; index++) {
      expect((frames[index]! - frames[index - 1]!) / 16000).toBeLessThanOrEqual(
        0.15
      )
    }
    expectExactAudio(f)
    expect(f.ended()).toBe(16003)
  } finally {
    f.source.dispose()
  }
})

test("normal decode work consumes the frame interval instead of adding permanent playback lag", async () => {
  const f = fixture({}, 40, 32003)
  try {
    await f.source.load(
      new File(["mixed"], "reference.mp4"),
      new AbortController().signal
    )
    const started = performance.now()
    await f.source.play()
    await until(() => f.ended() === f.pcm.length)
    expect(performance.now() - started).toBeLessThan(2800)
    expectExactAudio(f)
  } finally {
    f.source.dispose()
  }
})

test("native video and mixed audio continue while JPEG encoding is busy", async () => {
  let release: BlobCallback | null = null
  let frames = 0
  const f = fixture({
    canvasFactory: () =>
      ({
        getContext: () => ({ drawImage() {} }),
        toBlob: (callback: BlobCallback) => {
          if (++frames === 1) {
            callback(new Blob(["jpeg"]))
          } else {
            release = callback
          }
        },
      }) as unknown as HTMLCanvasElement,
  })
  try {
    await f.source.load(
      new File(["mixed"], "reference.mp4"),
      new AbortController().signal
    )
    await f.source.play()
    await until(() => release !== null)
    const before = f.source.position
    await Bun.sleep(200)
    expect(f.source.position).toBeGreaterThan(before + 1600)
    expect(f.video.currentTime).toBeGreaterThan(0.2)
    expect(f.nativePlays()).toBe(1)
  } finally {
    f.source.dispose()
    if (release) {
      ;(release as BlobCallback)(new Blob(["late"]))
    }
  }
})
