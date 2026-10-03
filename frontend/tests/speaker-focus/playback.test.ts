import { expect, test } from "bun:test"
import { PlaybackController } from "../../apps/web/src/features/speaker-focus/playback"

function fixture() {
  const video = Object.assign(new EventTarget(), {
    currentTime: 3,
    playbackRate: 1,
    paused: true,
    muted: false,
    pause() {
      this.paused = true
    },
    duration: 32,
  }) as unknown as HTMLVideoElement
  const sources: {
    offset: number
    stopped: boolean
    playbackRate: { value: number }
  }[] = []
  let closed = false
  const context = {
    currentTime: 10,
    destination: {},
    state: "running",
    resume: async () => {},
    close: async () => {
      closed = true
    },
    decodeAudioData: async () => ({ duration: 32 }),
    createGain: () => ({
      connect() {},
      disconnect() {},
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
    }),
    createBufferSource: () => {
      const source = {
        offset: -1,
        stopped: false,
        buffer: null,
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        start(_time: number, offset: number) {
          this.offset = offset
        },
        stop() {
          this.stopped = true
        },
      }
      sources.push(source)
      return source
    },
  } as unknown as AudioContext
  return { video, context, sources, closed: () => closed }
}

test("focused mode mutes original until genuine output is ready", async () => {
  const f = fixture()
  const playback = new PlaybackController(f.video, {
    contextFactory: () => f.context,
    fetcher: async () => new Response(new ArrayBuffer(1)),
    requestFrame: () => 1,
    cancelFrame: () => {},
  })
  await playback.listen("focused")
  expect(f.video.muted).toBe(true)
  expect(f.sources).toHaveLength(0)
  await playback.load("http://127.0.0.1:4033/jobs/test/audio", 1)
  f.video.paused = false
  f.video.dispatchEvent(new Event("play"))
  expect(f.sources.at(-1)?.offset).toBe(3)
  playback.dispose()
})

test("seek reanchors focused audio to the video clock and original mode stops it", async () => {
  const f = fixture()
  const playback = new PlaybackController(f.video, {
    contextFactory: () => f.context,
    fetcher: async () => new Response(new ArrayBuffer(1)),
    requestFrame: () => 1,
    cancelFrame: () => {},
  })
  await playback.listen("focused")
  await playback.load("audio", 1)
  f.video.paused = false
  f.video.dispatchEvent(new Event("play"))
  const old = f.sources.at(-1)!
  f.video.currentTime = 14
  f.video.dispatchEvent(new Event("seeking"))
  f.video.dispatchEvent(new Event("seeked"))
  expect(old.stopped).toBe(true)
  expect(f.sources.at(-1)?.offset).toBe(14)
  await playback.listen("original")
  expect(f.video.muted).toBe(false)
  expect(f.sources.at(-1)?.stopped).toBe(true)
  playback.dispose()
  expect(f.closed()).toBe(true)
})

test("late audio from a previous target cannot replace the active buffer", async () => {
  const f = fixture()
  let complete: (value: Response) => void = () => {}
  let calls = 0
  const playback = new PlaybackController(f.video, {
    contextFactory: () => f.context,
    fetcher: async () => {
      calls++
      return calls === 1
        ? new Promise((resolve) => {
            complete = resolve
          })
        : new Response(new ArrayBuffer(1))
    },
    requestFrame: () => 1,
    cancelFrame: () => {},
  })
  await playback.listen("focused")
  const obsolete = playback.load("old", 1)
  await playback.load("new", 2)
  complete(new Response(new ArrayBuffer(1)))
  await obsolete
  expect(playback.generation).toBe(2)
  playback.clear()
  expect(playback.ready).toBe(false)
  playback.dispose()
})
