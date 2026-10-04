import { expect, test, spyOn } from "bun:test"
import { ReplayController } from "../../apps/web/src/features/speaker-focus/replay-controller"
import { LivePlayer } from "../../apps/web/src/features/speaker-focus/live-player"
import { PreviewBuffer } from "../../apps/web/src/features/speaker-focus/preview-buffer"
import { SpeakerClient } from "../../apps/web/src/features/speaker-focus/client"

function fixture() {
  const starts: number[] = []
  const seeks: number[] = []
  let plays = 0
  const context = Object.assign(new EventTarget(), {
    currentTime: 10,
    sampleRate: 16000,
    baseLatency: 0,
    state: "running",
    destination: {},
    async resume() {},
    async close() {},
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
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      stop() {},
      start: (time: number) => starts.push(time),
      onended: null,
      buffer: null,
    }),
  }) as unknown as AudioContext
  const controller = new ReplayController()
  const source = {
    position: 240000,
    pause() {},
    setFlow() {},
    dispose() {},
    async play() {
      plays++
    },
    async seek(sample: number) {
      seeks.push(sample)
    },
  }
  const player = new LivePlayer({
    context,
    now: () => context.currentTime,
    onError: (message, sample) =>
      Reflect.get(controller, "pauseForOutput").call(
        controller,
        message,
        sample
      ),
  })
  player.reset(2)
  Reflect.set(controller, "source", source)
  Reflect.set(controller, "context", context)
  Reflect.set(controller, "player", player)
  Reflect.set(controller, "generation", 2)
  Reflect.set(controller, "anchor", 160000)
  Reflect.set(controller, "selectedPoint", [0.2, 0.3])
  Reflect.set(controller, "desired", true)
  Reflect.get(controller, "update").call(controller, {
    media: { width: 320, height: 180, duration: 32, sampleCount: 512000 },
    status: "playing",
    selectedId: "old-person",
    sourceSample: 160000,
  })
  const reply = (value: unknown) =>
    Reflect.get(controller, "reply").call(controller, value)
  const audio = (generation = 2, start = 160000) => ({
    type: "audio",
    generation,
    start_sample: start,
    sample_count: 32000,
    sample_rate: 16000,
    capture_spans: [
      { start_sample: start, end_sample: start + 32000, capture_time: 10 },
    ],
    device: "cpu",
    timings: { processing_seconds: 0.1 },
    queued_windows: 0,
    pcm: Buffer.from(new Float32Array(32000).buffer).toString("base64"),
  })
  return {
    controller,
    context,
    source,
    player,
    starts,
    seeks,
    reply,
    audio,
    plays: () => plays,
  }
}

test("suspended focused playback retains its played position instead of the target anchor", async () => {
  const f = fixture()
  try {
    f.reply(f.audio())
    Object.assign(f.context, {
      currentTime: f.starts[0]! + 1,
      state: "suspended",
    })
    expect(f.player.sourceSample()).toBe(176000)
    f.context.dispatchEvent(new Event("statechange"))
    await Promise.resolve()
    await Promise.resolve()
    expect(f.controller.getSnapshot().sourceSample).toBe(176000)
    expect(f.seeks).toEqual([176000])
    expect(f.controller.getSnapshot().status).toBe("paused")
  } finally {
    f.controller.dispose()
  }
})

test("pausing during rebuffering keeps the end of played audio", async () => {
  const f = fixture()
  try {
    f.reply(f.audio())
    Object.assign(f.context, { currentTime: 14 })
    f.reply(f.audio(2, 192000))
    await f.controller.pause()
    expect(f.controller.getSnapshot().sourceSample).toBe(192000)
  } finally {
    f.controller.dispose()
  }
})

test("pausing without current identity evidence requires explicit selection", async () => {
  const f = fixture()
  try {
    await f.controller.pause()
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        {
          id: "replacement",
          manual: false,
          observations: [{ timestamp: 10, box: [0.1, 0.1, 0.2, 0.5] }],
        },
      ],
    })
    expect(f.controller.getSnapshot().selectedId).toBeNull()
    expect(f.controller.getSnapshot().error).toContain("select")
  } finally {
    f.controller.dispose()
  }
})

test("pause reacquires the selected person's played position after movement", async () => {
  const f = fixture()
  Reflect.get(f.controller, "update").call(f.controller, {
    tracks: [
      {
        id: "old-person",
        manual: false,
        observations: [
          { timestamp: 0, box: [0.1, 0.1, 0.2, 0.5] },
          { timestamp: 10, box: [0.7, 0.1, 0.2, 0.5] },
        ],
      },
    ],
  })
  try {
    await f.controller.pause()
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        {
          id: "replacement",
          manual: false,
          observations: [{ timestamp: 10, box: [0.1, 0.1, 0.2, 0.5] }],
        },
        {
          id: "same-person-reacquired",
          manual: false,
          observations: [{ timestamp: 10, box: [0.7, 0.1, 0.2, 0.5] }],
        },
      ],
    })
    expect(f.controller.getSnapshot().selectedId).toBe("same-person-reacquired")
  } finally {
    f.controller.dispose()
  }
})

test("audio queued for a failed replay generation is never scheduled after its error", () => {
  const f = fixture()
  try {
    f.reply({
      type: "error",
      generation: 2,
      code: "live_inference_failed",
      message: "Extraction failed",
    })
    f.reply(f.audio())
    expect(f.starts).toEqual([])
    expect(f.controller.getSnapshot().status).toBe("paused")
    expect(f.controller.getSnapshot().error).toContain("Extraction failed")
  } finally {
    f.controller.dispose()
  }
})

test("a late denied audio permission after disposal does not reject playback", async () => {
  const f = fixture()
  let reject: (reason: Error) => void = () => {}
  f.context.resume = () =>
    new Promise((_, fail) => {
      reject = fail
    })
  const pending = f.controller.play()
  f.controller.dispose()
  reject(new Error("permission denied"))
  await expect(pending).resolves.toBeUndefined()
})

test("a late granted audio permission cannot start a replacement source", async () => {
  const f = fixture()
  let resolve: () => void = () => {}
  f.context.resume = () =>
    new Promise((done) => {
      resolve = done
    })
  const pending = f.controller.play()
  let replacementStarts = 0
  Reflect.get(f.controller, "release").call(f.controller)
  Reflect.set(f.controller, "source", {
    pause() {},
    dispose() {},
    async play() {
      replacementStarts++
    },
  })
  Reflect.get(f.controller, "update").call(f.controller, {
    status: "ready",
    label: "replacement",
  })
  resolve()
  await pending
  expect(replacementStarts).toBe(0)
  expect(f.controller.getSnapshot().status).toBe("ready")
  f.controller.dispose()
})

test("Reconnect restores streaming ownership at the preserved reference cursor", async () => {
  const f = fixture()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")
  const controls: Record<string, unknown>[] = []
  class Socket {
    readyState = 1
    bufferedAmount = 0
    onopen: (() => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onclose = null
    onerror = null
    constructor() {
      queueMicrotask(() => this.onopen?.())
    }
    close() {}
    send(value: string) {
      const control = JSON.parse(value)
      controls.push(control)
      if (control.type === "configure") {
        queueMicrotask(() =>
          this.onmessage?.({
            data: JSON.stringify({
              type: "ready",
              generation: 0,
              protocol_version: 2,
              device: "cpu",
              window_samples: 32000,
              stride_samples: 16000,
              warm_timings: [0.1, 0.2, 0.15],
              noise_processor: "rnnoise",
            }),
          } as MessageEvent)
        )
      }
    }
  }
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: Socket,
  })
  const health = spyOn(SpeakerClient.prototype, "health").mockResolvedValue({
    ready: true,
    model_state: "ready",
    engine: "RTFS-Net-4-LRS2",
    device: "cpu",
    error: null,
    clip: true,
    live: true,
    streaming_ready: true,
    streaming_error: null,
    max_upload_bytes: 125829120,
    max_duration: 120,
    queued: 0,
    window_seconds: 2,
    stride_seconds: 1,
  })
  Reflect.get(f.controller, "update").call(f.controller, {
    sourceSample: 176000,
    selectedId: null,
    status: "paused",
    serviceError: "offline",
  })
  Reflect.set(f.controller, "anchor", 176000)
  f.source.position = 176000
  try {
    await f.controller.connect()
    expect(controls.some((control) => control.type === "configure")).toBe(true)
    expect(
      controls.find((control) => control.type === "target")?.replay_start_sample
    ).toBe(176000)
    expect(f.controller.getSnapshot().serviceError).toBe("")
    expect(f.controller.getSnapshot().sourceSample).toBe(176000)
  } finally {
    f.controller.dispose()
    health.mockRestore()
    if (descriptor) {
      Object.defineProperty(globalThis, "WebSocket", descriptor)
    } else {
      Reflect.deleteProperty(globalThis, "WebSocket")
    }
  }
})

test("selecting the locked face again does not rewind or interrupt listening", async () => {
  const f = fixture()
  try {
    Reflect.get(f.controller, "update").call(f.controller, {
      tracks: [
        {
          id: "old-person",
          manual: false,
          observations: [{ timestamp: 10, box: [0.1, 0.1, 0.3, 0.4] }],
        },
      ],
    })
    await f.controller.select([0.2, 0.3])
    expect(f.seeks).toEqual([])
    expect(f.controller.getSnapshot().selectedId).toBe("old-person")
    expect(f.controller.getSnapshot().status).toBe("playing")
  } finally {
    f.controller.dispose()
  }
})

test("a mouse bubble beside a face reacquires that spatial target after detection shifts", async () => {
  const f = fixture()
  try {
    Reflect.get(f.controller, "update").call(f.controller, {
      selectedId: null,
      sourceSample: 160000,
      tracks: [
        {
          id: "left",
          manual: false,
          observations: [{ timestamp: 10, box: [0.1, 0.2, 0.15, 0.3] }],
        },
        {
          id: "right",
          manual: false,
          observations: [{ timestamp: 10, box: [0.7, 0.2, 0.15, 0.3] }],
        },
      ],
    })
    await f.controller.select([0.775, 0.175], {
      sourceSample: 160000,
      radius: [0.05, 32 / 360],
    })
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        {
          id: "right-reacquired",
          manual: false,
          observations: [{ timestamp: 10, box: [0.7, 0.21, 0.15, 0.3] }],
        },
        {
          id: "left-reacquired",
          manual: false,
          observations: [{ timestamp: 10, box: [0.1, 0.2, 0.15, 0.3] }],
        },
      ],
    })
    await Promise.resolve()
    expect(f.controller.getSnapshot().selectedId).toBe("right-reacquired")
    expect(f.controller.getSnapshot().error).toBe("")
    expect(f.plays()).toBe(1)
  } finally {
    f.controller.dispose()
  }
})

test("mouse selection uses the displayed frame instead of a later audio cursor", async () => {
  const f = fixture()
  try {
    f.reply(f.audio())
    Object.assign(f.context, { currentTime: f.starts[0]! + 1 })
    Reflect.get(f.controller, "update").call(f.controller, {
      tracks: [
        {
          id: "new-person",
          manual: false,
          observations: [
            { timestamp: 10, box: [0.7, 0.2, 0.15, 0.3] },
            { timestamp: 11, box: [0.4, 0.2, 0.15, 0.3] },
          ],
        },
      ],
    })
    await f.controller.select([0.775, 0.35], { sourceSample: 160000 })
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        {
          id: "new-person-reacquired",
          manual: false,
          observations: [{ timestamp: 10, box: [0.7, 0.2, 0.15, 0.3] }],
        },
      ],
    })
    expect(f.seeks).toEqual([160000, 160000])
    expect(f.controller.getSnapshot().selectedId).toBe("new-person-reacquired")
  } finally {
    f.controller.dispose()
  }
})

test("clicking background preserves the current audio lock without a selection error", async () => {
  const f = fixture()
  try {
    await f.controller.select([0.5, 0.95], {
      sourceSample: 160000,
      radius: [0.05, 32 / 360],
    })
    expect(f.controller.getSnapshot().selectedId).toBe("old-person")
    expect(f.controller.getSnapshot().error).toBe("")
    expect(f.seeks).toEqual([])
    expect(f.controller.getSnapshot().status).toBe("playing")
  } finally {
    f.controller.dispose()
  }
})

test("reference mouse bubbles choose the most-covered face through reacquisition, independent of array order", async () => {
  const f = fixture()
  const larger = {
    id: "larger",
    manual: false,
    observations: [{ timestamp: 10, box: [0.35, 0.4, 0.1, 0.2] }],
  }
  const smaller = {
    id: "smaller",
    manual: false,
    observations: [{ timestamp: 10, box: [0.49, 0.48, 0.03, 0.04] }],
  }
  try {
    Reflect.get(f.controller, "update").call(f.controller, {
      tracks: [smaller, larger],
    })
    await f.controller.select([0.5, 0.5], {
      sourceSample: 160000,
      radius: [0.2, 0.2],
    })
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        { ...larger, id: "larger-reacquired" },
        { ...smaller, id: "smaller-reacquired" },
      ],
    })
    expect(f.controller.getSnapshot().selectedId).toBe("larger-reacquired")
    expect(f.controller.getSnapshot().error).toBe("")
  } finally {
    f.controller.dispose()
  }
})

test("face selection and outlines follow the painted preview frame between audio ticks", async () => {
  const f = fixture()
  const preview = new PreviewBuffer({
    decode: async () =>
      ({ width: 320, height: 180, close() {} }) as ImageBitmap,
  })
  preview.reset(2)
  preview.add(160000, new Blob(["frame at 10 seconds"]), 2)
  preview.add(161067, new Blob(["next video frame"]), 2)
  Reflect.set(f.controller, "preview", preview)
  const canvas = {
    getContext: () => ({ drawImage() {} }),
  } as unknown as HTMLCanvasElement
  try {
    f.reply(f.audio())
    Object.assign(f.context, { currentTime: f.starts[0]! + 0.05 })
    Reflect.get(f.controller, "update").call(f.controller, {
      sourceSample: 160800,
      tracks: [
        {
          id: "new-person",
          manual: false,
          observations: [
            { timestamp: 10, box: [0.7, 0.2, 0.15, 0.3] },
            { timestamp: 161067 / 16000, box: [0.4, 0.2, 0.15, 0.3] },
          ],
        },
      ],
    })
    await f.controller.draw(canvas)
    expect(f.controller.getSnapshot().displayedSample).toBe(160000)
    await f.controller.select([0.775, 0.35])
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        {
          id: "new-person-reacquired",
          manual: false,
          observations: [{ timestamp: 10, box: [0.7, 0.2, 0.15, 0.3] }],
        },
      ],
    })
    expect(f.controller.getSnapshot().selectedId).toBe("new-person-reacquired")
    expect(f.seeks).toEqual([160000, 160000])
  } finally {
    f.controller.dispose()
  }
})

test("selecting another person after the clip finishes prepares their spatial target at the start", async () => {
  const f = fixture()
  Reflect.set(f.controller, "desired", false)
  Reflect.get(f.controller, "update").call(f.controller, {
    status: "ended",
    sourceSample: 510400,
    displayedSample: 510400,
    tracks: [
      {
        id: "new-person",
        manual: false,
        observations: [{ timestamp: 31.9, box: [0.7, 0.2, 0.15, 0.3] }],
      },
    ],
  })
  try {
    await f.controller.select([0.775, 0.35], {
      sourceSample: 510400,
      radius: [0.05, 32 / 360],
    })
    expect(f.seeks).toEqual([0])
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        {
          id: "person-at-start",
          manual: false,
          observations: [{ timestamp: 0, box: [0.7, 0.2, 0.15, 0.3] }],
        },
      ],
    })
    expect(f.controller.getSnapshot().selectedId).toBe("person-at-start")
    expect(f.controller.getSnapshot().status).toBe("paused")
    expect(f.plays()).toBe(0)
    await f.controller.play()
    expect(f.plays()).toBe(1)
    expect(f.controller.getSnapshot().selectedId).toBe("person-at-start")
  } finally {
    f.controller.dispose()
  }
})

test("replaying a finished clip reacquires the selected location instead of dropping the lock", async () => {
  const f = fixture()
  Reflect.set(f.controller, "desired", false)
  Reflect.get(f.controller, "update").call(f.controller, {
    status: "ended",
    sourceSample: 510400,
    displayedSample: 510400,
    tracks: [
      {
        id: "old-person",
        manual: false,
        observations: [{ timestamp: 31.9, box: [0.7, 0.2, 0.15, 0.3] }],
      },
    ],
  })
  try {
    await f.controller.play()
    f.reply({
      type: "faces",
      generation: 3,
      tracks: [
        {
          id: "person-at-start",
          manual: false,
          observations: [{ timestamp: 0, box: [0.7, 0.2, 0.15, 0.3] }],
        },
      ],
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(f.controller.getSnapshot().selectedId).toBe("person-at-start")
    expect(f.seeks).toEqual([0, 0])
    expect(f.plays()).toBe(1)
  } finally {
    f.controller.dispose()
  }
})

test("Original replay starts at zero without waiting for a face to be detected", async () => {
  const f = fixture()
  Reflect.set(f.controller, "desired", false)
  Reflect.get(f.controller, "update").call(f.controller, {
    mode: "original",
    status: "ended",
    sourceSample: 510400,
    displayedSample: 510400,
    tracks: [
      {
        id: "old-person",
        manual: false,
        observations: [{ timestamp: 31.9, box: [0.7, 0.2, 0.15, 0.3] }],
      },
    ],
  })
  try {
    await f.controller.play()
    expect(f.seeks).toEqual([0])
    expect(f.plays()).toBe(1)
    expect(f.controller.getSnapshot().status).toBe("playing")
    expect(f.controller.getSnapshot().error).toBe("")
  } finally {
    f.controller.dispose()
  }
})

test("a rejected processing session keeps its connection error when a face is clicked", async () => {
  const f = fixture()
  const message =
    "Speaker service is in use in another tab. Close that session, then reconnect."
  Reflect.get(f.controller, "streamUnavailable").call(f.controller, message)
  f.seeks.length = 0
  try {
    await f.controller.select([0.5, 0.35], {
      sourceSample: 160000,
      radius: [0.1, 0.1],
    })
    expect(f.controller.getSnapshot().error).toBe(message)
    expect(f.controller.getSnapshot().selectedId).toBeNull()
    expect(f.seeks).toEqual([])
  } finally {
    f.controller.dispose()
  }
})

test("focused playback cannot silently run without a processing session, while Original can", async () => {
  const f = fixture()
  Reflect.get(f.controller, "streamUnavailable").call(
    f.controller,
    "Processing session unavailable; reconnect"
  )
  try {
    await f.controller.play()
    expect(f.plays()).toBe(0)
    expect(f.controller.getSnapshot().status).toBe("paused")
    expect(f.controller.getSnapshot().error).toContain("reconnect")
    await f.controller.listen("original")
    await f.controller.play()
    expect(f.plays()).toBe(1)
    expect(f.controller.getSnapshot().status).toBe("playing")
  } finally {
    f.controller.dispose()
  }
})
