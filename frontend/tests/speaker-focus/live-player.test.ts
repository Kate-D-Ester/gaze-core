import { expect, test } from "bun:test"
import { LivePlayer } from "../../apps/web/src/features/speaker-focus/live-player"
function fixture() {
  const sources: { stopped: boolean; when: number }[] = []
  const context = {
    currentTime: 10,
    addEventListener() {},
    removeEventListener() {},
    state: "running",
    destination: {},
    resume: async () => {},
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
  const player = new LivePlayer({ context, now: () => 20, onError: () => {} })
  return { player, sources, context }
}
test("live playback rejects old targets and late output", () => {
  const f = fixture()
  f.player.reset(2)
  expect(f.player.audio(new Float32Array(16000), 18, 1)).toBe(false)
  expect(f.player.audio(new Float32Array(16000), 10, 2)).toBe(false)
  f.player.reset(2)
  expect(f.player.audio(new Float32Array(16000), 18, 2)).toBe(true)
  expect(f.sources[0]?.when).toBe(12)
  f.player.reset(3)
  expect(f.sources[0]?.stopped).toBe(true)
  f.player.dispose()
})
test("overload and clock discontinuities never schedule historical audio", () => {
  const f = fixture()
  f.player.reset(1)
  expect(f.player.audio(new Float32Array(16000), 18, 1)).toBe(true)
  expect(f.player.audio(new Float32Array(16000), 17, 1)).toBe(false)
  expect(f.player.audio(new Float32Array(16000), 19.2, 1)).toBe(false)
  f.player.dispose()
})

test("continuous live chunks use an envelope only at the target transition", () => {
  const values: number[][] = []
  const context = {
    currentTime: 10,
    addEventListener() {},
    removeEventListener() {},
    destination: {},
    state: "running",
    close: async () => {},
    createBuffer: () => ({ duration: 1, copyToChannel() {} }),
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
      onended: null,
      buffer: null,
    }),
    createGain: () => {
      const scheduled: number[] = []
      values.push(scheduled)
      return {
        connect() {},
        disconnect() {},
        gain: {
          value: 1,
          cancelScheduledValues() {},
          setValueAtTime(value: number) {
            scheduled.push(value)
          },
          linearRampToValueAtTime(value: number) {
            scheduled.push(value)
          },
        },
      }
    },
  } as unknown as AudioContext
  const player = new LivePlayer({ context, now: () => 20, onError: () => {} })
  player.reset(1)
  player.audio(new Float32Array(16000), 18, 1)
  player.audio(new Float32Array(16000), 19, 1)
  expect(values[1]).not.toContain(0)
  player.dispose()
})

test("an audio clock discontinuity stops previously scheduled live sound", () => {
  const f = fixture()
  f.player.reset(1)
  f.player.audio(new Float32Array(16000), 18, 1)
  f.player.audio(new Float32Array(16000), 19.2, 1)
  expect(f.sources[0]?.stopped).toBe(true)
  f.player.dispose()
})

test("audio output clock drift pauses instead of rebasing old scheduled chunks", () => {
  const f = fixture()
  f.player.reset(1)
  expect(f.player.audio(new Float32Array(16000), 18, 1)).toBe(true)
  Object.assign(f.context, { currentTime: 9 })
  expect(f.player.audio(new Float32Array(16000), 19, 1)).toBe(false)
  expect(f.sources[0]?.stopped).toBe(true)
  f.player.dispose()
})
