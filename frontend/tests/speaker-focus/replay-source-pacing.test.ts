import { expect, test } from "bun:test"
import { ReplaySource } from "../../apps/web/src/features/speaker-focus/replay-source"

test("slow frame encoding delays replay without skipping the selected person's video", async () => {
  let currentTime = 0
  let callback: VideoFrameRequestCallback | null = null
  const video = Object.assign(new EventTarget(), {
    videoWidth: 320,
    videoHeight: 180,
    duration: 0.4011875,
    readyState: 4,
    muted: true,
    playsInline: true,
    src: "",
    load() {},
    pause() {},
    removeAttribute() {},
    requestVideoFrameCallback(fn: VideoFrameRequestCallback) {
      callback = fn
      return 1
    },
    cancelVideoFrameCallback() {},
    async play() {
      for (const [index, time] of [0.0667, 0.3333, 0.4].entries()) {
        setTimeout(
          () => {
            currentTime = time
            const frame = callback
            callback = null
            frame?.(performance.now(), {
              mediaTime: time,
            } as VideoFrameCallbackMetadata)
            if (index === 2) {
              video.dispatchEvent(new Event("ended"))
            }
          },
          10 * (index + 1)
        )
      }
    },
  }) as unknown as HTMLVideoElement
  Object.defineProperty(video, "currentTime", {
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value
      queueMicrotask(() => video.dispatchEvent(new Event("seeked")))
    },
  })
  const frames: number[] = []
  const packets: { start: number; count: number }[] = []
  const errors: string[] = []
  let encoding = 0
  let finish: () => void = () => {}
  const ended = new Promise<void>((resolve) => {
    finish = resolve
  })
  const source = new ReplaySource({
    generation: () => 1,
    onFrame: (frame) => {
      frames.push(frame.sample)
    },
    onAudio: (packet) => {
      packets.push({ start: packet.startSample, count: packet.pcm.length })
    },
    onEnd: () => finish(),
    onError: (error) => errors.push(error),
    videoFactory: () => video,
    canvasFactory: () =>
      ({
        getContext: () => ({ drawImage() {} }),
        toBlob(fn: BlobCallback) {
          if (++encoding === 2) {
            setTimeout(() => fn(new Blob(["frame"])), 200)
          } else {
            fn(new Blob(["frame"]))
          }
        },
      }) as unknown as HTMLCanvasElement,
    createUrl: () => "blob:source",
    revokeUrl() {},
    decode: async () =>
      ({
        sampleRate: 16000,
        numberOfChannels: 1,
        length: 6419,
        getChannelData: () => new Float32Array(6419),
      }) as AudioBuffer,
  })
  try {
    await source.load(
      new File(["video"], "source.mp4"),
      new AbortController().signal
    )
    await source.play()
    await Promise.race([
      ended,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Replay did not finish")), 2000)
      ),
    ])
    for (let index = 1; index < frames.length; index++) {
      expect(frames[index]! - frames[index - 1]!).toBeLessThanOrEqual(1600)
    }
    expect(packets.reduce((count, packet) => count + packet.count, 0)).toBe(
      6419
    )
    expect(source.position).toBe(6419)
    expect(errors).toEqual([])
  } finally {
    source.dispose()
  }
})
