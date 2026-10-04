import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
import { LiveController } from "../../apps/web/src/features/speaker-focus/live-controller"
import { SpeakerClient } from "../../apps/web/src/features/speaker-focus/client"
import type { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"

test.each(["camera", "network"] as const)(
  "%s selection reaches the live engine with the chosen microphone, output and alignment",
  async (source) => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator"
    )
    const audioContext = globalThis.AudioContext
    const workletNode = globalThis.AudioWorkletNode
    const socketClass = globalThis.WebSocket
    const clock = spyOn(performance, "now").mockReturnValue(1000)
    const canvas = spyOn(
      HTMLCanvasElement.prototype,
      "getContext"
    ).mockReturnValue({ drawImage() {} } as never)
    let sink = ""
    let constraints: MediaStreamConstraints | null = null
    let stopped = 0
    let capturePort: MessagePort | null = null
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async (value: MediaStreamConstraints) => {
            constraints = value
            return {
              getTracks: () => [{ stop: () => stopped++ }],
            } as unknown as MediaStream
          },
        },
      },
    })
    globalThis.AudioContext = class {
      currentTime = 0
      sampleRate = 16000
      state = "running"
      destination = {}
      baseLatency = 0.01
      audioWorklet = { addModule: async () => {} }
      async resume() {}
      async close() {}
      async setSinkId(id: string) {
        sink = id
      }
      addEventListener() {}
      removeEventListener() {}
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} }
      }
    } as unknown as typeof AudioContext
    globalThis.AudioWorkletNode = class {
      port = { postMessage() {}, onmessage: null }
      constructor() {
        capturePort = this.port as unknown as MessagePort
      }
      connect() {}
      disconnect() {}
    } as unknown as typeof AudioWorkletNode
    const controls: Record<string, unknown>[] = []
    let socket: WebSocket | null = null
    globalThis.WebSocket = class {
      readyState = 1
      bufferedAmount = 0
      onopen: (() => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onclose = null
      onerror = null
      constructor() {
        socket = this as unknown as WebSocket
        queueMicrotask(() => this.onopen?.())
      }
      send(value: string) {
        if (typeof value === "string") {
          controls.push(JSON.parse(value))
        }
      }
      close() {}
    } as unknown as typeof WebSocket
    const health = spyOn(SpeakerClient.prototype, "health").mockResolvedValue({
      ready: true,
      live: true,
    } as never)
    const controller = new LiveController()
    controller.setEvidence({
      camera: { latest: null } as unknown as SceneCamera,
      frame: { id: 1, timestamp: 1000, generation: 1, width: 640, height: 480 },
      source: {
        kind: source,
        key: "scene",
        name: "Scene",
        url: "http://esp32.local/stream",
      },
      identity: "usb",
      measurement: null,
      verified: false,
    })
    controller.setPreviewTracks([
      {
        id: "preview-left",
        manual: false,
        observations: [{ timestamp: 1, box: [0.1, 0.1, 0.2, 0.3] }],
      },
    ])
    controller.correct([0.05, 0.05, 0.3, 0.4])
    controller.stop()
    const pending = controller.start(true, -500, {
      microphoneId: "usb-mic",
      outputId: "headphones",
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 0))
      controller.select([0.2, 0.2])
      expect(controls.filter((value) => value.type === "target")).toHaveLength(
        0
      )
      socket!.onmessage!({
        data: JSON.stringify({
          type: "ready",
          generation: 0,
          protocol_version: 3,
          analysis_mode: "available",
          engine: "av-mossformer2",
          device: "mps",
          minimum_samples: 1920,
          history_samples: 6400,
          maximum_input_samples: 48000,
          noise_processor: "rnnoise",
          warm_timings: [0.2, 0.2, 0.2],
        }),
      } as MessageEvent)
      await pending
      expect(controls.find((value) => value.type === "region")?.box).toEqual([
        0.05, 0.05, 0.3, 0.4,
      ])
      expect(controller.getSnapshot().status).toBe("live")
      expect(
        controls.find((value) => value.type === "configure")
      ).toMatchObject({ source, sync_verified: true, video_offset_ms: -500 })
      expect(sink).toBe("headphones")
      expect((constraints!.audio as MediaTrackConstraints).deviceId).toEqual({
        exact: "usb-mic",
      })
      socket!.onmessage!({
        data: JSON.stringify({
          type: "faces",
          generation: 0,
          tracks: [
            {
              id: "engine-right",
              manual: false,
              observations: [{ timestamp: 0.5, box: [0.6, 0.1, 0.2, 0.3] }],
            },
            {
              id: "engine-left",
              manual: false,
              observations: [{ timestamp: 0.5, box: [0.1, 0.1, 0.2, 0.3] }],
            },
          ],
        }),
      } as MessageEvent)
      expect(
        controls.filter((value) => value.type === "target").at(-1)?.target_id
      ).toBe("engine-left")
      expect(controller.getSnapshot().selection.selectedId).toBe("preview-left")
      await controller.setOutputDevice("other-headphones")
      expect(sink).toBe("other-headphones")
      expect(controller.getSnapshot().selection.selectedId).toBe("preview-left")
      expect(controller.getSnapshot().status).toBe("live")
      expect(
        controls.find((value) => value.type === "configure")
      ).toMatchObject({ source, sync_verified: true, video_offset_ms: -500 })
      expect(stopped).toBe(0)
      const generation = Number(
        controls.filter((value) => value.type === "target").at(-1)!.generation
      )
      capturePort!.onmessage!({
        data: {
          pcm: new Float32Array(1600).buffer,
          timestamp: 0,
          sampleStart: 0,
          generation,
        },
      } as MessageEvent)
      socket!.onmessage!({
        data: JSON.stringify({
          type: "flow",
          generation,
          action: "pause",
          queued_windows: 1,
          reason: "overload",
        }),
      } as MessageEvent)
      expect(controller.getSnapshot().status).toBe("draining")
      const targetCount = controls.filter(
        (value) => value.type === "target"
      ).length
      clock.mockReturnValue(2000)
      controller.setEvidence({
        camera: { latest: null } as unknown as SceneCamera,
        frame: {
          id: 2,
          timestamp: 2000,
          generation: 1,
          width: 640,
          height: 480,
        },
        source: {
          kind: source,
          key: "scene",
          name: "Scene",
          url: "http://esp32.local/stream",
        },
        identity: "usb",
        measurement: null,
        verified: false,
      })
      controller.setPreviewTracks([])
      controller.correct(null)
      expect(controls.filter((value) => value.type === "target")).toHaveLength(
        targetCount
      )
      expect(controller.getSnapshot().status).toBe("draining")
      expect(
        controls.find((value) => value.type === "end")?.source_end_sample
      ).toBe(17600)
    } finally {
      controller.dispose()
      await pending
      health.mockRestore()
      canvas.mockRestore()
      clock.mockRestore()
      globalThis.AudioContext = audioContext
      globalThis.AudioWorkletNode = workletNode
      globalThis.WebSocket = socketClass
      if (navigatorDescriptor) {
        Object.defineProperty(globalThis, "navigator", navigatorDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, "navigator")
      }
    }
    expect(stopped).toBe(1)
  }
)
