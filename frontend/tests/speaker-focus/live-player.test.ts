import { expect, test } from "bun:test"
import { LivePlayer } from "../../apps/web/src/features/speaker-focus/live-player"
function fixture() {
  const sources: { stopped: boolean; when: number; ramps: number[] }[] = []
  let now = 20
  const context = {
    currentTime: 10,
    sampleRate: 16000,
    baseLatency: 0.01,
    state: "running",
    addEventListener() {},
    removeEventListener() {},
    destination: {},
    close: async () => {},
    createBuffer: () => ({ copyToChannel() {} }),
    createGain: () => ({
      connect() {},
      disconnect() {},
      gain: {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime() {},
        linearRampToValueAtTime() {},
      },
    }),
    createBufferSource: () => {
      const source = {
        stopped: false,
        when: 0,
        ramps: [],
        connect() {},
        disconnect() {},
        start(time: number) {
          this.when = time
        },
        stop() {
          this.stopped = true
        },
        onended: null,
        buffer: null,
      }
      sources.push(source)
      return source
    },
  } as unknown as AudioContext
  const errors: string[] = []
  const player = new LivePlayer({
    context,
    now: () => now,
    onError: (e) => errors.push(e),
  })
  player.reset(2)
  const advance = (seconds: number) => {
    now += seconds
    Object.assign(context, { currentTime: context.currentTime + seconds })
  }
  const chunk = (startSample: number, captureTime = 0, size = 16000) => ({
    generation: 2,
    startSample,
    pcm: new Float32Array(size),
    captures: [{ startSample, endSample: startSample + size, captureTime }],
  })
  return { player, sources, context, errors, advance, chunk }
}
test("historical contiguous output is accepted and appended without a fixed delay", () => {
  const f = fixture()
  expect(f.player.audio(f.chunk(0, 10))).toBe(true)
  expect(f.player.audio(f.chunk(16000, 11))).toBe(true)
  expect(f.sources[1]!.when).toBeCloseTo(f.sources[0]!.when + 1, 6)
  expect(f.player.getTiming().state).not.toBe("failed")
  f.player.reset(3)
  expect(f.sources[0]!.stopped).toBe(true)
})
test("duplicates and gaps stop invalid sound", () => {
  for (const second of [0, 16001]) {
    const f = fixture()
    f.player.audio(f.chunk(0))
    expect(f.player.audio(f.chunk(second))).toBe(false)
    expect(f.sources[0]!.stopped).toBe(true)
  }
})
test("underrun rebuilds reserve without failing or speeding up speech", () => {
  const f = fixture()
  f.player.audio(f.chunk(0))
  const reserve = f.player.getTiming().reserveSeconds
  f.advance(3)
  expect(f.player.getTiming().state).toBe("buffering")
  expect(f.player.audio(f.chunk(16000, 3))).toBe(true)
  expect(f.player.getTiming().reserveSeconds).toBeGreaterThan(reserve)
  expect(f.errors).toEqual([])
})
test("cursor, piecewise capture delay and EOF follow scheduled samples", () => {
  const f = fixture()
  f.player.audio(f.chunk(0, 10))
  f.player.audio(f.chunk(16000, 19))
  const when = f.sources[0]!.when
  f.advance(when - 10 + 1.5)
  expect(f.player.sourceSample()).toBe(24000)
  expect(f.player.getTiming().delaySeconds).toBeCloseTo(
    20 + when - 10 + 1.5 - 19.5 + 0.01,
    3
  )
  f.player.flushEnd(32000)
  f.advance(1)
  expect(f.player.getTiming().state).toBe("ended")
})
test("real clock discontinuity and suspension reject output", () => {
  for (const state of ["drift", "suspended"]) {
    const f = fixture()
    f.player.audio(f.chunk(0))
    Object.assign(f.context, state === "drift" ? { currentTime: 9 } : { state })
    expect(f.player.audio(f.chunk(16000))).toBe(false)
    expect(f.sources[0]!.stopped).toBe(true)
  }
})

test("a running output clock may lag the wall clock without interrupting valid speech", () => {
  const f = fixture()
  f.player.audio(f.chunk(0))
  const when = f.sources[0]!.when
  f.advance(3)
  Object.assign(f.context, { currentTime: when + 0.5 })
  expect(f.player.sourceSample()).toBe(8000)
  expect(f.player.audio(f.chunk(16000, 3))).toBe(true)
  expect(f.errors).toEqual([])
  expect(f.sources[0]!.stopped).toBe(false)
  expect(f.sources[1]!.when).toBeCloseTo(when + 1, 6)
})
