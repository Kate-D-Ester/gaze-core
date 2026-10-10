import { expect, test } from "bun:test"
import type { RemoteRequest } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import {
  RemoteSession,
  type SessionEnvironment,
  type SessionState,
} from "../../apps/web/src/features/remote-eye-tracking/session"

function fixture(overrides: Partial<SessionEnvironment> = {}) {
  let resolveStream!: (stream: MediaStream) => void
  let ended: (() => void) | null = null
  let stopped = 0,
    terminated = 0,
    closed = 0
  let frame: FrameRequestCallback | null = null
  let captured = 0
  const requests: RemoteRequest[] = []
  const track = {
    stop: () => stopped++,
    addEventListener: (_event: string, cb: () => void) => {
      ended = cb
    },
  }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage: (request: RemoteRequest) => requests.push(request),
    terminate: () => terminated++,
  } as unknown as Worker
  const video = {
    srcObject: null,
    currentTime: 0,
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {},
    pause: () => {},
  } as unknown as HTMLVideoElement
  const states: SessionState[] = []
  const env: SessionEnvironment = {
    getStream: () =>
      new Promise((resolve) => {
        resolveStream = resolve
      }),
    enumerate: async () => [],
    worker: () => worker,
    capture: async () => {
      captured++
      return { close: () => closed++ } as ImageBitmap
    },
    requestFrame: (cb) => {
      frame = cb
      return 1
    },
    cancelFrame: () => {
      frame = null
    },
    ...overrides,
  }
  const session = new RemoteSession(video, (state) => states.push(state), env)
  const ready = () =>
    worker.onmessage?.({
      data: { type: "ready", method: "test" },
    } as MessageEvent)
  return {
    session,
    states,
    stream,
    worker,
    requests,
    ready,
    resolve: () => resolveStream(stream),
    tick: () => frame?.(10),
    ended: () => ended?.(),
    stopped: () => stopped,
    terminated: () => terminated,
    closed: () => closed,
    captured: () => captured,
    video,
  }
}
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test("changing only IR roll compensation reaches the next source frame", async () => {
  const f = fixture()
  const settings = { roi: { x: 0, y: 0, width: 1, height: 1 }, threshold: 0 }
  try {
    const start = f.session.start("ir")
    f.resolve()
    await start
    f.ready()
    for (const enabled of [true, false]) {
      f.session.setSettings({ ...settings, irRollCompensation: enabled })
      f.video.currentTime += 0.033
      f.tick()
      await flush()
      const request = f.requests.at(-1)
      expect(request?.type).toBe("frame")
      if (request?.type !== "frame")
        throw new Error("Expected a captured frame")
      expect(Boolean(request.settings.irRollCompensation)).toBe(enabled)
      f.worker.onmessage?.({
        data: {
          type: "result",
          observation: { timestamp: performance.now(), feature: null },
        },
      } as MessageEvent)
    }
  } finally {
    f.session.stop()
  }
})

test("performance readout separates capture cost from original source latency", async () => {
  const originalNow = performance.now
  let clock = 100
  performance.now = () => clock
  const f = fixture({
    capture: async () => {
      clock = 120
      return { close: () => {} } as ImageBitmap
    },
  })
  try {
    const start = f.session.start("mobile")
    f.resolve()
    await start
    f.ready()
    f.tick()
    await flush()
    clock = 170
    f.worker.onmessage?.({
      data: {
        type: "result",
        observation: {
          timestamp: 100,
          feature: [0.5],
          processingMs: 40,
          timing: { landmarksMs: 25, appearanceMs: 10 },
        },
      },
    } as MessageEvent)
    const observation = f.states.at(-1)?.observation
    expect(observation?.timestamp).toBe(100)
    expect(observation?.timing?.captureMs).toBe(20)
    expect(observation?.timing?.endToEndMs).toBe(70)
    expect(observation?.timing?.landmarksMs).toBe(25)
    expect(observation?.processingMs).toBe(40)
  } finally {
    f.session.stop()
    performance.now = originalNow
  }
})

test("a permission response arriving after Stop is released and never activates the camera", async () => {
  const f = fixture()
  const start = f.session.start("mobile")
  f.session.stop()
  f.resolve()
  await start
  expect(f.stopped()).toBe(1)
  expect(f.video.srcObject).toBeNull()
  expect(f.states.at(-1)?.status).toBe("idle")
})
test("camera and model must both be ready before tracking starts", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  expect(f.states.at(-1)?.status).toBe("loading")
  f.ready()
  await flush()
  expect(f.states.at(-1)?.status).toBe("ready")
  f.session.stop()
  expect(f.stopped()).toBe(1)
  expect(f.terminated()).toBe(1)
})
test("fatal model errors release an active stream and are visible", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.worker.onmessage?.({
    data: { type: "error", fatal: true, message: "Model could not load" },
  } as MessageEvent)
  expect(f.states.at(-1)?.status).toBe("error")
  expect(f.states.at(-1)?.error).toBe("Model could not load")
  expect(f.stopped()).toBe(1)
  expect(f.terminated()).toBe(1)
})
test("camera disconnection clears the last result and releases resources", async () => {
  const f = fixture()
  const start = f.session.start("ir")
  f.resolve()
  await start
  f.ready()
  f.ended()
  expect(f.states.at(-1)?.status).toBe("error")
  expect(f.states.at(-1)?.observation).toBeNull()
  expect(f.stopped()).toBe(1)
})
test("a frame captured after Stop is closed instead of posted to a terminated worker", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.ready()
  f.tick()
  f.session.stop()
  await flush()
  expect(f.closed()).toBe(1)
})

test("an unchanged physical video frame is not captured again as a fresh observation", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.ready()
  f.tick()
  await flush()
  f.worker.onmessage?.({
    data: {
      type: "result",
      observation: { timestamp: performance.now(), feature: null },
    },
  } as MessageEvent)
  f.tick()
  await flush()
  expect(f.captured()).toBe(1)
  f.video.currentTime = 0.033
  f.tick()
  await flush()
  expect(f.captured()).toBe(2)
  f.session.stop()
})

test("last gaze expires when the camera presents no further source frames", async () => {
  const f = fixture()
  const start = f.session.start("webcam")
  f.resolve()
  await start
  f.ready()
  f.worker.onmessage?.({
    data: {
      type: "result",
      observation: { timestamp: performance.now(), feature: [0.5] },
    },
  } as MessageEvent)
  expect(f.states.at(-1)?.observation).not.toBeNull()
  await new Promise((resolve) => setTimeout(resolve, 1050))
  expect(f.states.at(-1)?.observation).toBeNull()
  f.session.stop()
})

function camera(deviceId: string, label: string): MediaDeviceInfo {
  const value = { deviceId, label, kind: "videoinput" as const, groupId: "" }
  return { ...value, toJSON: () => value }
}

test("camera discovery lists available video devices before opening a stream", async () => {
  const microphone = {
    ...camera("mic", "Microphone"),
    kind: "audioinput" as const,
  }
  const f = fixture({
    enumerate: async () => [
      camera("front", "Built-in camera"),
      microphone,
      camera("usb", "USB camera"),
    ],
    getStream: async () => {
      throw new Error("Discovery must not request camera access")
    },
    worker: () => {
      throw new Error("Discovery must not load tracking models")
    },
  })
  await flush()
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "front",
    "usb",
  ])
  expect(f.states.at(-1)?.status).toBe("idle")
  expect(f.video.srcObject).toBeNull()
  f.session.stop()
})

test("camera choices remain available during setup and after Stop", async () => {
  const f = fixture({ enumerate: async () => [camera("usb", "USB camera")] })
  await flush()
  const start = f.session.start("webcam", "usb")
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "usb",
  ])
  f.session.stop()
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "usb",
  ])
  f.resolve()
  await start
})

test("devicechange refreshes the available camera choices without starting tracking", async () => {
  let devices = [camera("front", "Built-in camera")]
  const changes = new EventTarget()
  const f = fixture({
    enumerate: async () => devices,
    onDeviceChange: (refresh) => {
      changes.addEventListener("devicechange", refresh)
      return () => changes.removeEventListener("devicechange", refresh)
    },
  })
  await flush()
  devices = [camera("front", "Built-in camera"), camera("usb", "USB camera")]
  changes.dispatchEvent(new Event("devicechange"))
  await flush()
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "front",
    "usb",
  ])
  f.session.stop()
  devices = [camera("usb", "USB camera")]
  changes.dispatchEvent(new Event("devicechange"))
  await flush()
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "usb",
  ])
  expect(f.states.at(-1)?.status).toBe("idle")
})

test("a newer discovery result cannot be overwritten by an older device list", async () => {
  let resolveInitial!: (devices: MediaDeviceInfo[]) => void
  let initial = true
  const f = fixture({
    enumerate: () => {
      if (initial) {
        initial = false
        return new Promise((resolve) => {
          resolveInitial = resolve
        })
      }
      return Promise.resolve([camera("usb", "USB camera")])
    },
  })
  await f.session.refreshDevices()
  resolveInitial([camera("front", "Built-in camera")])
  await flush()
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "usb",
  ])
})

test("a failed camera refresh preserves known choices and reports discovery failure separately", async () => {
  let reject = false
  const f = fixture({
    enumerate: async () => {
      if (reject) throw new DOMException("Blocked", "NotAllowedError")
      return [camera("usb", "USB camera")]
    },
  })
  await flush()
  reject = true
  await f.session.refreshDevices()
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "usb",
  ])
  expect(f.states.at(-1)?.cameraError).toContain("permission")
  expect(f.states.at(-1)?.error).toBe("")
  expect(f.states.at(-1)?.status).toBe("idle")
})

test("an empty camera list remains recoverable without opening a permission prompt", async () => {
  const f = fixture({
    enumerate: async () => [],
    getStream: async () => {
      throw new Error("Unexpected permission prompt")
    },
  })
  await flush()
  expect(f.states.at(-1)?.devices).toEqual([])
  expect(f.states.at(-1)?.cameraAccess).toBe("idle")
  expect(f.states.at(-1)?.cameraError).toBe("")
  expect(f.states.at(-1)?.status).toBe("idle")
})

test("explicit camera access reveals labels and releases video without loading a model", async () => {
  let unlocked = false
  let requested: MediaStreamConstraints | undefined
  const f = fixture({
    enumerate: async () =>
      unlocked
        ? [camera("front", "Built-in camera"), camera("usb", "USB camera")]
        : [camera("", "")],
    getStream: async (constraints) => {
      requested = constraints
      unlocked = true
      return f.stream
    },
    worker: () => {
      throw new Error("Permission discovery must not load a model")
    },
  })
  await flush()
  await f.session.requestCameraAccess()
  expect(requested).toEqual({ audio: false, video: true })
  expect(f.states.at(-1)?.devices.map((device) => device.deviceId)).toEqual([
    "front",
    "usb",
  ])
  expect(f.states.at(-1)?.cameraAccess).toBe("granted")
  expect(f.states.at(-1)?.status).toBe("idle")
  expect(f.video.srcObject).toBeNull()
  expect(f.stopped()).toBe(1)
})

test("denied camera discovery permission leaves tracking idle with a recoverable camera error", async () => {
  const f = fixture({
    getStream: async () => {
      throw new DOMException("Denied", "NotAllowedError")
    },
  })
  await flush()
  await f.session.requestCameraAccess()
  expect(f.states.at(-1)?.cameraAccess).toBe("error")
  expect(f.states.at(-1)?.cameraError).toContain("permission")
  expect(f.states.at(-1)?.status).toBe("idle")
  expect(f.states.at(-1)?.error).toBe("")
})

test.each(["stop", "dispose"] as const)(
  "a camera discovery stream arriving after %s is released without changing state",
  async (action) => {
    const f = fixture()
    await flush()
    const permission = f.session.requestCameraAccess()
    f.session[action]()
    const count = f.states.length
    f.resolve()
    await permission
    expect(f.stopped()).toBe(1)
    expect(f.states).toHaveLength(count)
    expect(f.video.srcObject).toBeNull()
  }
)

test("Stop releases a discovery stream while its device enumeration is still pending", async () => {
  let initial = true
  let resolveDevices!: (devices: MediaDeviceInfo[]) => void
  const f = fixture({
    enumerate: () => {
      if (initial) {
        initial = false
        return Promise.resolve([])
      }
      return new Promise((resolve) => {
        resolveDevices = resolve
      })
    },
  })
  await flush()
  const permission = f.session.requestCameraAccess()
  f.resolve()
  await flush()
  f.session.stop()
  expect(f.stopped()).toBe(1)
  const count = f.states.length
  resolveDevices([camera("usb", "USB camera")])
  await permission
  expect(f.states).toHaveLength(count)
  expect(f.states.at(-1)?.devices).toEqual([])
  expect(f.stopped()).toBe(1)
})

test("dispose removes devicechange discovery and ignores an enumeration already in flight", async () => {
  const changes = new EventTarget()
  let enumerations = 0
  let resolveDevices!: (devices: MediaDeviceInfo[]) => void
  const f = fixture({
    enumerate: () => {
      enumerations++
      return new Promise((resolve) => {
        resolveDevices = resolve
      })
    },
    onDeviceChange: (refresh) => {
      changes.addEventListener("devicechange", refresh)
      return () => changes.removeEventListener("devicechange", refresh)
    },
  })
  f.session.dispose()
  const count = f.states.length
  changes.dispatchEvent(new Event("devicechange"))
  expect(enumerations).toBe(1)
  resolveDevices([camera("usb", "USB camera")])
  await flush()
  expect(f.states).toHaveLength(count)
})

test.each([false, true])(
  "browser discovery handles unavailable secure camera APIs (secure context: %s)",
  async (secure) => {
    const originalNavigator = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator"
    )
    const originalSecure = Object.getOwnPropertyDescriptor(
      globalThis,
      "isSecureContext"
    )
    const states: SessionState[] = []
    const video = {
      pause: () => {},
      cancelVideoFrameCallback: () => {},
    } as unknown as HTMLVideoElement
    let session: RemoteSession | undefined
    try {
      Object.defineProperty(globalThis, "isSecureContext", {
        configurable: true,
        value: secure,
      })
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          mediaDevices: secure
            ? undefined
            : { enumerateDevices: async () => [camera("usb", "USB camera")] },
        },
      })
      session = new RemoteSession(video, (state) => states.push(state))
      await flush()
      expect(states.at(-1)?.cameraAccess).toBe("error")
      expect(states.at(-1)?.cameraError).toContain("HTTPS")
      expect(states.at(-1)?.status).toBe("idle")
      expect(states.at(-1)?.devices).toEqual([])
    } finally {
      session?.dispose()
      if (originalNavigator)
        Object.defineProperty(globalThis, "navigator", originalNavigator)
      else Reflect.deleteProperty(globalThis, "navigator")
      if (originalSecure)
        Object.defineProperty(globalThis, "isSecureContext", originalSecure)
      else Reflect.deleteProperty(globalThis, "isSecureContext")
    }
  }
)

test("a refresh failure during a pending permission request cannot open a second camera request", async () => {
  const pending: ((stream: MediaStream) => void)[] = []
  const f = fixture({
    enumerate: async () => {
      throw new DOMException("Blocked", "NotAllowedError")
    },
    getStream: () =>
      new Promise((resolve) => {
        pending.push(resolve)
      }),
  })
  await flush()
  const first = f.session.requestCameraAccess()
  await f.session.refreshDevices()
  const second = f.session.requestCameraAccess()
  try {
    expect(pending).toHaveLength(1)
  } finally {
    f.session.stop()
    pending.forEach((resolve) => resolve(f.stream))
    await Promise.all([first, second])
  }
})
