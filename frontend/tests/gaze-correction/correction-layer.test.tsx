import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { GazeBubbleOverlay } =
  await import("../../apps/web/src/features/gaze-bubble/gaze-bubble-overlay")

test("correction is opt-in, updates actual offsets, cancels with Escape and rejects stale samples", async () => {
  let now = 1000
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const rectangle = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect"
  ).mockReturnValue({
    x: 20,
    y: 80,
    width: 800,
    height: 400,
    top: 80,
    left: 20,
    bottom: 480,
    right: 820,
    toJSON() {},
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const calibration = {}
  let offset: Point = [0, 0]
  let changes = 0
  let request = 0
  const render = async (point: Point = [0.4, 0.6]) => {
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          point,
          timestamp: now,
          resetKey: calibration,
          offset,
          imageSize: { width: 600, height: 800 },
          fixed: false,
          correction: {
            request,
            onChange: (next) => {
              offset = next
              changes++
            },
          },
        })
      )
    )
  }
  const sampleHold = async (point?: Point) => {
    for (let i = 0; i < 6; i++) {
      now += 40
      await render(point)
    }
  }
  const clickTarget = async (x: number, y: number) => {
    const target = host.querySelector(
      '[aria-label="Click the target to correct gaze"]'
    )!
    await act(async () =>
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: x,
          clientY: y,
        })
      )
    )
  }
  try {
    await render()
    expect(
      host.querySelector('[aria-label="Click the target to correct gaze"]')
    ).toBeNull()
    request++
    await sampleHold()
    await clickTarget(40, 280)
    expect(changes).toBe(0)
    expect(host.textContent).toContain("Click inside the camera image")
    await clickTarget(420, 280)
    expect(changes).toBe(1)
    expect(offset[0]).toBeCloseTo(0.1)
    expect(offset[1]).toBeCloseTo(-0.1)
    await render([0.5, 0.5])
    expect(
      host.querySelector('[aria-label="Click the target to correct gaze"]')
    ).toBeNull()
    request++
    await sampleHold([0.5, 0.5])
    now += 400
    await clickTarget(420, 280)
    expect(changes).toBe(1)
    expect(host.textContent).toContain("Wait for live gaze")
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
    await act(async () => document.dispatchEvent(escape))
    expect(escape.defaultPrevented).toBe(true)
    expect(
      host.querySelector('[aria-label="Click the target to correct gaze"]')
    ).toBeNull()
    request++
    await sampleHold([1.1, 0.5])
    // Correction remains possible when the display bubble is off-screen.
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    await clickTarget(420, 280)
    expect(changes).toBe(2)
    expect(offset[0]).toBeCloseTo(-0.5)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
    rectangle.mockRestore()
  }
})
