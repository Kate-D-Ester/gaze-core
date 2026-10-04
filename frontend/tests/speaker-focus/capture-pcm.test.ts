import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import {
  startCapture,
  PcmResampler,
} from "../../apps/web/src/features/speaker-focus/capture"
import type { CaptureMessage } from "../../apps/web/src/features/speaker-focus/capture.types"

if (typeof document === "undefined") {
  GlobalRegistrator.register()
}

async function captureFixture() {
  const originalNode = globalThis.AudioWorkletNode
  const clock = spyOn(performance, "now").mockReturnValue(1000)
  const canvas = spyOn(
    HTMLCanvasElement.prototype,
    "getContext"
  ).mockReturnValue({ drawImage() {} } as never)
  const pcm: Float32Array[] = []
  const packets: ArrayBuffer[] = []
  const errors: string[] = []
  let stopped = 0
  let node: AudioWorkletNode | null = null
  globalThis.AudioWorkletNode = class extends EventTarget {
    port = { postMessage() {}, onmessage: null }
    constructor() {
      super()
      node = this as unknown as AudioWorkletNode
    }
    connect() {}
    disconnect() {}
  } as unknown as typeof AudioWorkletNode
  try {
    const stop = await startCapture(
      {
        getTracks: () => [{ stop: () => stopped++ }],
      } as unknown as MediaStream,
      {
        camera: {
          latest: {
            id: 1,
            timestamp: 1000,
            generation: 1,
            width: 640,
            height: 480,
          },
          rawCanvas: document.createElement("canvas"),
        } as never,
        context: {
          currentTime: 0.5,
          audioWorklet: { addModule: async () => {} },
          resume: async () => {},
          createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
          destination: {},
        } as unknown as AudioContext,
        signal: new AbortController().signal,
        generation: () => 5,
        onPcm: (samples, start, time, generation) => {
          expect([start, time, generation]).toEqual([12000, 0.75, 5])
          pcm.push(samples.slice())
        },
        onPacket: (value) => packets.push(value),
        onError: (value) => errors.push(value),
      }
    )
    return {
      pcm,
      packets,
      errors,
      get stopped() {
        return stopped
      },
      send(samples: Float32Array, generation = 5) {
        node!.port.onmessage?.({
          data: {
            pcm: samples.buffer,
            generation,
            timestamp: 0.25,
            sampleStart: 4000,
          },
        } as MessageEvent<CaptureMessage>)
      },
      processorError() {
        node!.dispatchEvent(new Event("processorerror"))
      },
      dispose() {
        stop()
        canvas.mockRestore()
        clock.mockRestore()
        globalThis.AudioWorkletNode = originalNode
      },
    }
  } catch (error) {
    canvas.mockRestore()
    clock.mockRestore()
    globalThis.AudioWorkletNode = originalNode
    throw error
  }
}

test("loud microphone PCM is attenuated uniformly before both local playback and network transport", async () => {
  const capture = await captureFixture()
  try {
    capture.send(new Float32Array([2, -1, 0.5, -2]))
    expect([...capture.pcm[0]!]).toEqual([1, -0.5, 0.25, -1])
    const packet = capture.packets[0]!
    expect([...new Float32Array(packet, 32)]).toEqual([1, -0.5, 0.25, -1])
    const header = new DataView(packet)
    expect(header.getUint32(8, true)).toBe(5)
    expect(header.getBigUint64(12, true)).toBe(12000n)
    expect(header.getFloat64(20, true)).toBe(0.75)
    expect(capture.errors).toEqual([])
  } finally {
    capture.dispose()
  }
})

test.each([44100, 48000])(
  "%i Hz resampling overshoot cannot reject an otherwise normalized microphone",
  async (rate) => {
    const capture = await captureFixture()
    try {
      const input = Float32Array.from({ length: rate / 10 }, (_, index) =>
        index < rate / 20 ? 1 : -1
      )
      const output = new PcmResampler(rate).push(input)
      expect(output.some((value) => Math.abs(value) > 1.01)).toBe(true)
      capture.send(output)
      const transmitted = new Float32Array(capture.packets[0]!, 32)
      expect(transmitted.length).toBe(1600)
      expect(
        transmitted.every(
          (value) => Number.isFinite(value) && Math.abs(value) <= 1
        )
      ).toBe(true)
      expect(capture.errors).toEqual([])
    } finally {
      capture.dispose()
    }
  }
)

test("ordinary microphone samples retain their exact level", async () => {
  const capture = await captureFixture()
  try {
    capture.send(new Float32Array([-0.5, 0.25, 0, 1]))
    expect([...capture.pcm[0]!]).toEqual([-0.5, 0.25, 0, 1])
    expect([...new Float32Array(capture.packets[0]!, 32)]).toEqual([
      -0.5, 0.25, 0, 1,
    ])
  } finally {
    capture.dispose()
  }
})

test.each([NaN, Infinity, -Infinity])(
  "nonfinite microphone sample %s stops capture before playback or transport",
  async (invalid) => {
    const capture = await captureFixture()
    try {
      capture.send(new Float32Array([0.1, invalid]))
      expect(capture.pcm).toHaveLength(0)
      expect(capture.packets).toHaveLength(0)
      expect(capture.errors[0]).toContain("invalid audio")
      expect(capture.stopped).toBe(1)
    } finally {
      capture.dispose()
    }
  }
)

test("worklet failure reports the invalid audio path and releases microphone tracks", async () => {
  const capture = await captureFixture()
  try {
    capture.processorError()
    expect(capture.errors[0]).toContain("microphone")
    expect(capture.stopped).toBe(1)
  } finally {
    capture.dispose()
  }
})

test("old-generation PCM cannot alter capture or trigger a microphone error", async () => {
  const capture = await captureFixture()
  try {
    capture.send(new Float32Array([NaN]), 4)
    expect(capture.pcm).toHaveLength(0)
    expect(capture.packets).toHaveLength(0)
    expect(capture.errors).toHaveLength(0)
    expect(capture.stopped).toBe(0)
  } finally {
    capture.dispose()
  }
})
