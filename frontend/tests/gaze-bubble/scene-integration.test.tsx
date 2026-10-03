import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { GazeMeasurement } from "../../apps/web/src/features/scene-eye-tracking/scene.types"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { SceneCamera } =
  await import("../../apps/web/src/features/scene-eye-tracking/scene-camera")
const { ScenePreview } =
  await import("../../apps/web/src/features/scene-eye-tracking/scene-preview")

test("scene preview uses compact bubbles, preserves measurements, and hides on capture or loss", async () => {
  const clock = spyOn(performance, "now").mockReturnValue(1000)
  const rectangle = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect"
  ).mockReturnValue({
    x: 0,
    y: 0,
    width: 640,
    height: 480,
    top: 0,
    left: 0,
    bottom: 480,
    right: 640,
    toJSON() {},
  })
  const context = spyOn(
    HTMLCanvasElement.prototype,
    "getContext"
  ).mockReturnValue(new Proxy({}, { get: () => () => {} }) as any)
  const camera = new SceneCamera()
  const measurement: GazeMeasurement = {
    timestamp: 1000,
    eyeId: 1,
    sceneId: 1,
    eyeTimestamp: 995,
    sceneTimestamp: 990,
    confidence: 0.9,
    position: [0.5, 0.5],
    pixels: [960, 540],
    valid: true,
    reason: "",
    extrapolated: false,
  }
  const original = structuredClone(measurement)
  const props = {
    camera,
    frame: { id: 1, timestamp: 990, generation: 0, width: 1920, height: 1080 },
    gaze: measurement,
    hand: null,
    trace: [measurement],
    holds: [],
    capturing: false,
    target: null,
    progress: 0,
    connection: "live" as const,
    gazeDisplay: { errorRadiusPx: 600, verified: true },
  }
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(ScenePreview, props)))
    const bubble = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(bubble).not.toBeNull()
    expect(parseFloat(bubble.style.width)).toBe(180)
    expect(bubble.dataset.motion).toBe("moving")
    expect(host.textContent).toContain(
      "Calibration error is larger than the bubble"
    )
    expect(measurement).toEqual(original)
    await act(async () =>
      root.render(createElement(ScenePreview, { ...props, capturing: true }))
    )
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    await act(async () =>
      root.render(
        createElement(ScenePreview, {
          ...props,
          gaze: { ...measurement, valid: false, position: null },
        })
      )
    )
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    await act(async () =>
      root.render(
        createElement(ScenePreview, {
          ...props,
          gaze: { ...measurement, valid: false, preview: true },
          gazeDisplay: { errorRadiusPx: null, verified: false },
        })
      )
    )
    expect(host.textContent).toContain("Accuracy not checked")
    expect(host.querySelector(".gaze-bubble")).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
    rectangle.mockRestore()
    context.mockRestore()
  }
})
