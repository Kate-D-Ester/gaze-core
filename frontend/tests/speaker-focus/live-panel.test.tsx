import { afterEach, expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
import { act, createElement } from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { LiveSpeakerPanel } from "../../apps/web/src/features/speaker-focus/live-panel"
import { LiveController } from "../../apps/web/src/features/speaker-focus/live-controller"
import type { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  host?.remove()
  root = null
})
test("leaving the focus workspace stops microphone capture and returns to a safe idle view", async () => {
  const stop = spyOn(LiveController.prototype, "stop")
  const camera = {
    latest: null,
    rawCanvas: document.createElement("canvas"),
  } as unknown as SceneCamera
  const props = {
    camera,
    frame: null,
    measurement: null,
    source: null,
    identity: "test",
    verified: false,
    guided: true,
    active: true,
  }
  host = document.createElement("div")
  document.body.append(host)
  try {
    await act(async () => {
      root = createRoot(host!)
      root.render(createElement(LiveSpeakerPanel, props))
    })
    expect(
      host.querySelector('[aria-label="Current scene for speaker selection"]')
    ).not.toBeNull()
    expect(host.querySelector('[aria-label="Current scene video"]')).toBeNull()
    await act(async () => {
      root!.render(createElement(LiveSpeakerPanel, { ...props, active: false }))
    })
    expect(stop).toHaveBeenCalled()
    expect(
      host
        .querySelector('button[aria-label="Start live microphone"]')
        ?.hasAttribute("disabled")
    ).toBe(true)
  } finally {
    stop.mockRestore()
  }
})

test.each([
  { allowUnverifiedGaze: false, errorRadiusPx: 20 },
  { allowUnverifiedGaze: true, errorRadiusPx: 20 },
  { allowUnverifiedGaze: true, errorRadiusPx: null },
])(
  "changing gaze coordinates complete a continuous dwell with Focus permission %j",
  async ({ allowUnverifiedGaze, errorRadiusPx }) => {
    const { SceneSelectionAdapter } =
      await import("../../apps/web/src/features/speaker-focus/scene-adapter")
    const adapter = new SceneSelectionAdapter()
    let now = 1000
    let latest: Parameters<LiveController["setEvidence"]>[0] | null = null
    let displayed: Parameters<LiveController["setDisplayedGaze"]>[0] = null
    const clock = spyOn(performance, "now").mockImplementation(() => now)
    const rectangle = spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect"
    ).mockReturnValue({
      x: 0,
      y: 0,
      width: 800,
      height: 450,
      top: 0,
      left: 0,
      bottom: 450,
      right: 800,
      toJSON() {},
    })
    const camera = {
      latest: null,
      rawCanvas: document.createElement("canvas"),
    } as unknown as SceneCamera
    const props = (time: number) => ({
      camera,
      frame: {
        id: time,
        timestamp: time,
        generation: 1,
        width: 320,
        height: 180,
      },
      measurement: {
        timestamp: time,
        eyeId: time,
        sceneId: time,
        eyeTimestamp: time,
        sceneTimestamp: time,
        confidence: 1,
        position: [0.2 + (time - 1000) / 10000, 0.2] as [number, number],
        pixels: [64, 36] as [number, number],
        valid: true,
        reason: "",
        estimated: allowUnverifiedGaze,
        extrapolated: false,
      },
      source: null,
      identity: "test",
      verified: !allowUnverifiedGaze,
      allowUnverifiedGaze,
      errorRadiusPx,
      guided: true,
      active: true,
    })
    const observe = () => {
      if (latest) {
        adapter.observe({
          ...latest,
          measurement: displayed?.measurement ?? null,
          bubble: displayed?.bubble ?? null,
          tracks: [
            {
              id: "person",
              manual: false,
              observations: [
                { timestamp: now / 1000, box: [0.1, 0.1, 0.3, 0.3] },
              ],
            },
          ],
          now,
        })
      }
    }
    const evidence = spyOn(
      LiveController.prototype,
      "setEvidence"
    ).mockImplementation((value) => {
      latest = value
      observe()
    })
    const publication = spyOn(
      LiveController.prototype,
      "setDisplayedGaze"
    ).mockImplementation((value) => {
      displayed = value
      observe()
    })
    host = document.createElement("div")
    document.body.append(host)
    try {
      await act(async () => {
        root = createRoot(host!)
        root.render(createElement(LiveSpeakerPanel, props(now)))
      })
      for (now = 1100; now <= 1500; now += 100) {
        await act(async () =>
          root!.render(createElement(LiveSpeakerPanel, props(now)))
        )
        expect(displayed?.measurement.timestamp).toBe(now)
        expect(displayed?.bubble.timestamp).toBe(now)
      }
      expect(adapter.state.selectedId).toBe("person")
      const bubble = host.querySelector<HTMLElement>(".gaze-bubble")!
      expect(bubble.className).not.toContain("transition-")
      expect(parseFloat(bubble.style.left)).toBeCloseTo(25)
      await act(async () =>
        root!.render(
          createElement(LiveSpeakerPanel, { ...props(now), measurement: null })
        )
      )
      expect(displayed).toBeNull()
      expect(adapter.state.selectedId).toBe("person")
    } finally {
      await act(async () => root?.unmount())
      root = null
      evidence.mockRestore()
      publication.mockRestore()
      clock.mockRestore()
      rectangle.mockRestore()
    }
  }
)

test("Focus exposes both device selectors and keeps the current camera preview visible", async () => {
  const camera = {
    latest: null,
    rawCanvas: document.createElement("canvas"),
  } as unknown as SceneCamera
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(
      createElement(LiveSpeakerPanel, {
        camera,
        frame: null,
        measurement: null,
        source: null,
        identity: "devices",
        verified: false,
        guided: true,
        active: true,
      })
    )
  })
  expect(host.querySelector('select[aria-label="Microphone"]')).not.toBeNull()
  expect(
    host.querySelector('select[aria-label="Speaker / headphones"]')
  ).not.toBeNull()
  expect(
    host.querySelector('[aria-label="Current scene for speaker selection"]')
  ).not.toBeNull()
  expect(host.textContent).toContain("Enable audio devices")
})

test.each(["camera", "network"] as const)(
  "%s alignment can be confirmed and changing the microphone requires a new check",
  async (source) => {
    const mediaDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "mediaDevices"
    )
    const saved = localStorage.getItem(
      "gazecore.speaker-focus.audio-devices.v1"
    )
    localStorage.removeItem("gazecore.speaker-focus.audio-devices.v1")
    const media = new EventTarget()
    Object.assign(media, {
      enumerateDevices: async () =>
        ["mic-a", "mic-b"].map((deviceId) => ({
          kind: "audioinput",
          deviceId,
          label: deviceId,
          groupId: "",
          toJSON() {},
        })),
    })
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: media,
    })
    const camera = {
      latest: null,
      rawCanvas: document.createElement("canvas"),
      subscribe: () => () => {},
    } as unknown as SceneCamera
    host = document.createElement("div")
    document.body.append(host)
    try {
      await act(async () => {
        root = createRoot(host!)
        root.render(
          createElement(LiveSpeakerPanel, {
            camera,
            frame: {
              id: 1,
              generation: 1,
              width: 640,
              height: 480,
              timestamp: performance.now(),
            },
            measurement: null,
            source: {
              kind: source,
              key: "test",
              name: "Camera",
              url: "http://esp32.local/stream",
            },
            identity: "mic-alignment",
            verified: false,
            guided: true,
            active: true,
          })
        )
      })
      const check = host.querySelector<HTMLInputElement>(
        'input[type="checkbox"]'
      )!
      const start = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Start live microphone"]'
      )!
      await act(async () => check.click())
      expect(check.checked).toBe(true)
      expect(start.disabled).toBe(false)
      await act(async () => {
        const select = host!.querySelector<HTMLSelectElement>(
          'select[aria-label="Microphone"]'
        )!
        select.value = "mic-b"
        select.dispatchEvent(new Event("change", { bubbles: true }))
      })
      expect(check.checked).toBe(false)
      expect(start.disabled).toBe(true)
    } finally {
      await act(async () => root?.unmount())
      root = null
      if (mediaDescriptor) {
        Object.defineProperty(navigator, "mediaDevices", mediaDescriptor)
      } else {
        Reflect.deleteProperty(navigator, "mediaDevices")
      }
      if (saved) {
        localStorage.setItem("gazecore.speaker-focus.audio-devices.v1", saved)
      } else {
        localStorage.removeItem("gazecore.speaker-focus.audio-devices.v1")
      }
    }
  }
)
