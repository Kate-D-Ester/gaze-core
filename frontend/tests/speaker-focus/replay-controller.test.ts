import { expect, test, spyOn } from "bun:test"
import { ReplayController } from "../../apps/web/src/features/speaker-focus/replay-controller"
import { SpeakerClient } from "../../apps/web/src/features/speaker-focus/client"
test("reference connection never requests uploaded-file analysis or extraction", async () => {
  const health = spyOn(SpeakerClient.prototype, "health").mockRejectedValue(
    new Error("offline")
  )
  const upload = spyOn(SpeakerClient.prototype, "upload")
  const controller = new ReplayController()
  try {
    await controller.connect()
    expect(controller.getSnapshot().serviceError).toContain("offline")
    expect(upload).not.toHaveBeenCalled()
    expect(controller.getSnapshot().mode).toBe("focused")
  } finally {
    controller.dispose()
    health.mockRestore()
    upload.mockRestore()
  }
})


test("reference click rejects overlapping face identities before restarting", async () => {
  const controller = new ReplayController()
  const tracks = ["one", "two"].map((id) => ({
    id,
    manual: false,
    observations: [{ timestamp: 0, box: [0, 0, 1, 1] }],
  }))
  Reflect.get(controller, "update").call(controller, { tracks })
  const restart = spyOn(controller as never, "restart" as never).mockResolvedValue(undefined as never)
  try {
    await controller.select([0.5, 0.5])
    expect(restart).not.toHaveBeenCalled()
    expect(controller.getSnapshot().selectedId).toBeNull()
    expect(controller.getSnapshot().error).toContain("visible face")
  } finally {
    restart.mockRestore()
    controller.dispose()
  }
})

test("reference reacquisition rejects ambiguous faces instead of choosing the first", () => {
  const controller = new ReplayController()
  Reflect.set(controller, "pendingPoint", [0.5, 0.5])
  const tracks = ["one", "two"].map((id) => ({
    id,
    manual: false,
    observations: [{ timestamp: 0, box: [0, 0, 1, 1] }],
  }))
  try {
    Reflect.get(controller, "reply").call(controller, {
      type: "faces", generation: 0, tracks,
    })
    expect(controller.getSnapshot().selectedId).toBeNull()
    expect(controller.getSnapshot().error).toContain("select again")
  } finally {
    controller.dispose()
  }
})

test("service connection failure retains decoded reference for Original comparison", async () => {
  const { ReplaySource } = await import("../../apps/web/src/features/speaker-focus/replay-source")
  const { StreamConnection } = await import("../../apps/web/src/features/speaker-focus/stream-connection")
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "AudioContext")
  class ReferenceAudioContext extends EventTarget {
    sampleRate = 16000
    baseLatency = 0
    currentTime = 0
    async close() {}
    async resume() {}
  }
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true, value: ReferenceAudioContext,
  })
  const media = { width: 320, height: 180, duration: 1, sampleCount: 16000 }
  const load = spyOn(ReplaySource.prototype, "load").mockResolvedValue(media)
  const seek = spyOn(ReplaySource.prototype, "seek").mockResolvedValue()
  const open = spyOn(StreamConnection.prototype, "open").mockImplementation(async function () {
    Reflect.get(this, "options").onError("service offline")
    throw new Error("service offline")
  })
  const controller = new ReplayController()
  try {
    await controller.loadReference()
    expect(controller.getSnapshot().media).toEqual(media)
    expect(controller.getSnapshot().serviceError).toContain("offline")
    expect(seek).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().mode).toBe("focused")
    await controller.listen("original")
    expect(controller.getSnapshot().media).toEqual(media)
    expect(controller.getSnapshot().mode).toBe("original")
    const player = Reflect.get(controller, "player")
    Reflect.get(player, "options").onError("Audio output clock changed")
    await Promise.resolve()
    expect(controller.getSnapshot().media).toEqual(media)
    expect(controller.getSnapshot().status).toBe("paused")
  } finally {
    controller.dispose()
    load.mockRestore()
    seek.mockRestore()
    open.mockRestore()
    if (descriptor) {
      Object.defineProperty(globalThis, "AudioContext", descriptor)
    } else {
      Reflect.deleteProperty(globalThis, "AudioContext")
    }
  }
})

test("denied audio resume keeps the reference available for a retry", async () => {
  const controller = new ReplayController()
  const dispose = spyOn({ dispose() {} }, "dispose")
  let permitted = false
  let starts = 0
  Reflect.set(controller, "context", {
    resume: async () => {
      if (!permitted) {
        throw new Error("Playback permission denied")
      }
    },
  })
  Reflect.set(controller, "source", {
    position: 0, pause() {}, dispose,
    play: async () => { starts++ },
  })
  const media = { width: 320, height: 180, duration: 1, sampleCount: 16000 }
  Reflect.get(controller, "update").call(controller, { media, status: "ready" })
  try {
    await controller.play()
    expect(controller.getSnapshot().media).toEqual(media)
    expect(controller.getSnapshot().status).toBe("paused")
    expect(dispose).not.toHaveBeenCalled()
    permitted = true
    await controller.play()
    expect(starts).toBe(1)
  } finally {
    controller.dispose()
  }
})
