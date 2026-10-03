import { expect, test, spyOn } from "bun:test"
import {
  PcmResampler,
  packetBytes,
  startMicrophone,
} from "../../apps/web/src/features/speaker-focus/capture"

test("resampling preserves a continuous stream across input chunks", () => {
  const resampler = new PcmResampler(48000)
  const samples = new Float32Array(4800).fill(0.2)
  const a = resampler.push(samples.slice(0, 1234))
  const b = resampler.push(samples.slice(1234))
  expect(a.length + b.length).toBe(1600)
  expect([...a, ...b].every((x) => Math.abs(x - 0.2) < 1e-6)).toBe(true)
  expect(() => resampler.push(samples, 44100)).toThrow("sample rate")
})
test("video-only ESP32 capture requires an explicitly started separate microphone", async () => {
  await expect(
    startMicrophone({
      source: "network",
      syncVerified: false,
      getUserMedia: async () => {
        throw new Error("should not request")
      },
    })
  ).rejects.toThrow("synchronization")
  await expect(
    startMicrophone({
      source: "camera",
      syncVerified: true,
      getUserMedia: async () => {
        throw new DOMException("Permission denied", "NotAllowedError")
      },
    })
  ).rejects.toThrow("microphone")
})
test("stopping while the microphone permission is pending releases a late stream", async () => {
  const abort = new AbortController()
  let stopped = 0
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped++
        },
      },
    ],
  } as unknown as MediaStream
  const promise = startMicrophone({
    source: "camera",
    syncVerified: true,
    signal: abort.signal,
    getUserMedia: async () => {
      abort.abort()
      return stream
    },
  })
  await expect(promise).rejects.toThrow()
  expect(stopped).toBe(1)
})
test("binary live packets carry exact generation and timestamps", () => {
  const bytes = packetBytes(1, 7, 12.5, new Float32Array(1600).buffer)
  const view = new DataView(bytes)
  expect(view.getUint32(8, true)).toBe(7)
  expect(view.getFloat64(12, true)).toBe(12.5)
  expect(bytes.byteLength).toBe(6424)
  expect(() => packetBytes(1, 0, NaN, new ArrayBuffer(4))).toThrow()
})

test("live setup reports an unavailable audio device without leaking a rejected start", async () => {
  const { LiveController } =
    await import("../../apps/web/src/features/speaker-focus/live-controller")
  const original = globalThis.AudioContext
  globalThis.AudioContext = class {
    constructor() {
      throw new Error("Audio device unavailable")
    }
  } as unknown as typeof AudioContext
  const controller = new LiveController()
  const { SceneCamera } =
    await import("../../apps/web/src/features/scene-eye-tracking/scene-camera")
  const camera = Object.create(SceneCamera.prototype) as InstanceType<
    typeof SceneCamera
  >
  controller.setEvidence({
    camera,
    frame: {
      id: 1,
      timestamp: performance.now(),
      generation: 1,
      width: 320,
      height: 180,
    },
    source: { kind: "camera", name: "test", key: "test" },
    identity: "test",
    measurement: null,
    verified: false,
  })
  try {
    await expect(controller.start(true, 0)).resolves.toBeUndefined()
    expect(controller.getSnapshot().status).toBe("failed")
    expect(controller.getSnapshot().error).toContain("Audio device unavailable")
  } finally {
    controller.dispose()
    globalThis.AudioContext = original
  }
})

test("downsampling suppresses microphone frequencies above the 16 kHz Nyquist limit", () => {
  const input = Float32Array.from(
    { length: 4800 },
    (_, i) => 0.7 * Math.sin((2 * Math.PI * 12000 * i) / 48000)
  )
  const output = new PcmResampler(48000).push(input).slice(100)
  const rms = Math.sqrt(
    output.reduce((sum, value) => sum + value * value, 0) / output.length
  )
  expect(rms).toBeLessThan(0.02)
})

test("regular arrival timestamps cannot authorize a drifting network camera", async () => {
  const { LiveController } =
    await import("../../apps/web/src/features/speaker-focus/live-controller")
  const controller = new LiveController()
  try {
    for (const arrival of [performance.now(), performance.now() + 10]) {
      controller.setEvidence({
        camera: {} as never,
        frame: {
          id: 1,
          timestamp: arrival,
          generation: 1,
          width: 320,
          height: 180,
        },
        source: {
          kind: "network",
          name: "ESP32",
          key: "esp",
          url: "http://esp.local",
        },
        identity: "esp",
        measurement: null,
        verified: false,
      })
      await controller.start(true, 0)
      expect(controller.getSnapshot().status).toBe("failed")
      expect(controller.getSnapshot().error).toContain("capture timestamps")
    }
  } finally {
    controller.dispose()
  }
})

test("arrival-only network capture never requests a microphone even after manual checking", async () => {
  let requested = false
  await expect(
    startMicrophone({
      source: "network",
      syncVerified: true,
      getUserMedia: async () => {
        requested = true
        throw new Error("unexpected request")
      },
    })
  ).rejects.toThrow("capture timestamps")
  expect(requested).toBe(false)
})

test("pending microphone permission does not open an idle live session", async () => {
  const { LiveController } =
    await import("../../apps/web/src/features/speaker-focus/live-controller")
  const { SpeakerClient } =
    await import("../../apps/web/src/features/speaker-focus/client")
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator"
  )
  const audio = globalThis.AudioContext
  const webSocket = globalThis.WebSocket
  let release: (stream: MediaStream) => void = () => {}
  const permission = new Promise<MediaStream>((resolve) => {
    release = resolve
  })
  let stopped = 0
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped++
        },
      },
    ],
  } as unknown as MediaStream
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { getUserMedia: () => permission },
    },
  })
  globalThis.AudioContext = class {
    currentTime = 0
    resume() {
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
    addEventListener() {}
    removeEventListener() {}
  } as unknown as typeof AudioContext
  globalThis.WebSocket = class {
    constructor() {
      throw new Error("Session opened before microphone permission")
    }
  } as unknown as typeof WebSocket
  const health = spyOn(SpeakerClient.prototype, "health").mockResolvedValue({
    ready: true,
    model_state: "ready",
    engine: "RTFS-Net-4-LRS2",
    device: "cpu",
    error: null,
    clip: true,
    live: true,
    max_upload_bytes: 125829120,
    max_duration: 120,
    queued: 0,
    window_seconds: 2,
    stride_seconds: 1,
  })
  const controller = new LiveController()
  controller.setEvidence({
    camera: {} as never,
    frame: {
      id: 1,
      timestamp: performance.now(),
      generation: 1,
      width: 320,
      height: 180,
    },
    source: { kind: "camera", name: "USB", key: "usb" },
    identity: "usb",
    measurement: null,
    verified: false,
  })
  const pending = controller.start(true, 0)
  try {
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(controller.getSnapshot().status).toBe("starting")
    expect(controller.getSnapshot().error).toBe("")
    controller.stop()
    release(stream)
    await pending
    expect(stopped).toBe(1)
  } finally {
    controller.dispose()
    release(stream)
    await pending
    health.mockRestore()
    globalThis.AudioContext = audio
    globalThis.WebSocket = webSocket
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, "navigator")
    }
  }
})
