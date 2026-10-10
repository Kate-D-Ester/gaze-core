import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { GazeBubbleOverlay } =
  await import("../../apps/web/src/features/gaze-bubble/gaze-bubble-overlay")

test("overlay caps the full border box, reports excessive error, resets offsets and expires stale samples", async () => {
  let now = 1000
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const calibration = {}
  const base = {
    point: [0.5, 0.5] as [number, number],
    timestamp: 1000,
    errorRadiusPx: 200,
    verified: true,
    resetKey: calibration,
  }
  try {
    await act(async () => root.render(createElement(GazeBubbleOverlay, base)))
    let bubble = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(parseFloat(bubble.style.width)).toBe(300)
    expect(bubble.style.maxWidth).toBe("300px")
    expect(bubble.style.maxHeight).toBe("300px")
    expect(bubble.style.boxSizing).toBe("border-box")
    expect(bubble.style.boxShadow).toBe("none")
    expect(bubble.dataset.limited).toBe("true")
    expect(host.textContent).toContain(
      "Calibration error is larger than the bubble"
    )
    for (let i = 1; i <= 5; i++) {
      now += 40
      await act(async () =>
        root.render(
          createElement(GazeBubbleOverlay, { ...base, timestamp: now })
        )
      )
    }
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          timestamp: now,
          point: [0.52, 0.5],
          offset: [0.02, 0],
          verified: false,
          errorRadiusPx: null,
        })
      )
    )
    bubble = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(parseFloat(bubble.style.left)).toBeCloseTo(52)
    expect(host.textContent).toContain("Accuracy not checked")
    now += 351
    await act(async () => new Promise((resolve) => setTimeout(resolve, 360)))
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    now += 40
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          timestamp: now,
          point: [0.8, 0.2],
        })
      )
    )
    expect(
      parseFloat(host.querySelector<HTMLElement>(".gaze-bubble")!.style.left)
    ).toBeCloseTo(80)
    await act(async () =>
      root.render(createElement(GazeBubbleOverlay, { ...base, point: null }))
    )
    expect(host.querySelector(".gaze-bubble")).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
  }
})

test("scene overlay fits the contained image and translates native error into CSS diameter", async () => {
  const clock = spyOn(performance, "now").mockReturnValue(1000)
  const rectangle = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect"
  ).mockReturnValue({
    x: 0,
    y: 0,
    width: 800,
    height: 800,
    top: 0,
    left: 0,
    bottom: 800,
    right: 800,
    toJSON() {},
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          point: [0.5, 0.5],
          timestamp: 1000,
          imageSize: { width: 1920, height: 1080 },
          fixed: false,
          stabilize: false,
          errorRadiusPx: 100,
          verified: true,
        })
      )
    )
    const view = host.querySelector<HTMLElement>(".gaze-bubble-view")!
    expect(view.style.top).toBe("175px")
    expect(view.style.height).toBe("450px")
    const bubble = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(parseFloat(bubble.style.width)).toBeCloseTo((100 * 800 * 2) / 1920)
    expect(bubble.style.maxWidth).toBe("225px")
    expect(bubble.style.maxHeight).toBe("225px")
    expect(bubble.dataset.motion).toBe("moving")
    expect(bubble.dataset.limited).toBe("false")
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
    rectangle.mockRestore()
  }
})

test("off-screen scene estimates indicate the image edge and return to the ordinary bubble", async () => {
  let now = 1000
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const rectangle = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect"
  ).mockReturnValue({
    x: 0,
    y: 0,
    width: 800,
    height: 800,
    top: 0,
    left: 0,
    bottom: 800,
    right: 800,
    toJSON() {},
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const base = {
    point: [1.1, 0.5] as [number, number],
    timestamp: now,
    imageSize: { width: 1920, height: 1080 },
    fixed: false,
    stabilize: false,
    errorRadiusPx: 100,
    verified: true,
  }
  try {
    await act(async () => root.render(createElement(GazeBubbleOverlay, base)))
    const view = host.querySelector<HTMLElement>(".gaze-bubble-view")!
    expect(view.style.top).toBe("175px")
    const indicator = host.querySelector<HTMLElement>(".gaze-edge-indicator")!
    expect(indicator.style.left).toBe("792px")
    expect(indicator.style.top).toBe("225px")
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    for (let i = 0; i < 8; i++) {
      now += 40
      await act(async () =>
        root.render(
          createElement(GazeBubbleOverlay, {
            ...base,
            point: [0.9, 0.5],
            timestamp: now,
          })
        )
      )
    }
    expect(host.querySelector(".gaze-edge-indicator")).toBeNull()
    const bubble = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(bubble).not.toBeNull()
    expect(parseFloat(bubble.style.width)).toBeCloseTo((100 * 800 * 2) / 1920)
    expect(host.textContent).not.toContain("Gaze estimate outside screen")
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          point: [NaN, 0.5],
          timestamp: now,
        })
      )
    )
    expect(host.querySelector(".gaze-edge-indicator")).toBeNull()
    expect(host.querySelector(".gaze-bubble")).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
    rectangle.mockRestore()
  }
})
