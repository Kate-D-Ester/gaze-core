import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { GazeBubbleOverlaySnapshot } from "../../apps/web/src/features/gaze-bubble/gaze-bubble-overlay.types"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { GazeBubbleOverlay, drawGazeBubbleOverlay } =
  await import("../../apps/web/src/features/gaze-bubble/gaze-bubble-overlay")

test("uncertainty region retains a small center cursor in live view and scaled recordings", async () => {
  const clock = spyOn(performance, "now").mockReturnValue(1000)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const snapshotRef = { current: null as GazeBubbleOverlaySnapshot | null }
  try {
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          point: [0.3, 0.7],
          timestamp: 1000,
          profile: "remote-adaptive",
          stabilize: false,
          errorRadiusPx: 45,
          verified: true,
          snapshotRef,
        })
      )
    )
    const marker = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(marker.querySelector(".gaze-center-cursor")).not.toBeNull()
    expect(parseFloat(marker.style.left)).toBeCloseTo(30)
    expect(parseFloat(marker.style.top)).toBeCloseTo(70)
    expect(snapshotRef.current!.bubble.errorRadiusPx).toBe(45)
    const circles: number[][] = []
    const context = {
      save() {},
      restore() {},
      beginPath() {},
      stroke() {},
      fill() {},
      arc(x: number, y: number, radius: number) {
        circles.push([x, y, radius])
      },
    } as unknown as CanvasRenderingContext2D
    const snapshot = snapshotRef.current!
    const width = snapshot.view.width * 2
    const height = snapshot.view.height * 2
    drawGazeBubbleOverlay(context, snapshot, width, height)
    expect(circles[0]).toEqual([
      width * 0.3,
      height * 0.7,
      parseFloat(marker.style.width),
    ])
    expect(circles[1]).toEqual([width * 0.3, height * 0.7, 10])
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
  }
})

test("cursor-only presentation keeps measured error but draws a small marker in both live view and recordings", async () => {
  const now = 1000
  const clock = spyOn(performance, "now").mockReturnValue(now)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const snapshotRef = { current: null as GazeBubbleOverlaySnapshot | null }
  try {
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          point: [0.5, 0.5],
          timestamp: now,
          profile: "remote-adaptive",
          stabilize: false,
          errorRadiusPx: 450,
          showUncertainty: false,
          snapshotRef,
        })
      )
    )
    const marker = host.querySelector<HTMLElement>(".gaze-bubble")!
    expect(parseFloat(marker.style.width)).toBe(10)
    expect(parseFloat(marker.style.height)).toBe(10)
    expect(snapshotRef.current!.bubble.errorRadiusPx).toBe(450)
    expect(snapshotRef.current!.bubble.rawPoint).toEqual([0.5, 0.5])
    expect(host.textContent).not.toContain("larger than the bubble")
    expect(host.textContent).toContain("Accuracy limited")
    const radii: number[] = []
    const context = {
      save() {},
      restore() {},
      beginPath() {},
      stroke() {},
      fill() {},
      arc(_x: number, _y: number, radius: number) {
        radii.push(radius)
      },
    } as unknown as CanvasRenderingContext2D
    const view = snapshotRef.current!.view
    drawGazeBubbleOverlay(
      context,
      snapshotRef.current!,
      view.width,
      view.height
    )
    expect(radii).toEqual([5])
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
  }
})

test.each([
  [-0.1, 0.5, 180],
  [1.1, 0.5, 0],
  [0.5, -0.1, -90],
  [0.5, 1.1, 90],
  [-0.1, -0.1, -135],
  [1.1, -0.1, -45],
  [-0.1, 1.1, 135],
  [1.1, 1.1, 45],
])(
  "off-screen direction %p,%p uses a small edge indicator and preserves recording coordinates",
  async (x, y, angle) => {
    let now = 1000
    const clock = spyOn(performance, "now").mockImplementation(() => now)
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const snapshotRef = { current: null as GazeBubbleOverlaySnapshot | null }
    const base = {
      point: [x, y] as [number, number],
      timestamp: now,
      profile: "remote-adaptive" as const,
      stabilize: false,
      snapshotRef,
      errorRadiusPx: 200,
      verified: true,
    }
    try {
      await act(async () => root.render(createElement(GazeBubbleOverlay, base)))
      expect(host.querySelector(".gaze-bubble")).toBeNull()
      const indicator = host.querySelector<HTMLElement>(".gaze-edge-indicator")!
      expect(indicator).not.toBeNull()
      expect(indicator.style.transform).toContain(`rotate(${angle}deg)`)
      expect(parseFloat(indicator.style.width)).toBeLessThanOrEqual(16)
      const view = snapshotRef.current!.view
      let expectedLeft = view.width / 2
      if (x < 0) {
        expectedLeft = 8
      } else if (x > 1) {
        expectedLeft = view.width - 8
      }
      let expectedTop = view.height / 2
      if (y < 0) {
        expectedTop = 8
      } else if (y > 1) {
        expectedTop = view.height - 8
      }
      expect(parseFloat(indicator.style.left)).toBeCloseTo(expectedLeft)
      expect(parseFloat(indicator.style.top)).toBeCloseTo(expectedTop)
      expect(host.querySelector('[role="status"]')?.textContent).toContain(
        "Gaze estimate outside screen"
      )
      expect(host.textContent).toContain(
        "Calibration error is larger than the bubble"
      )
      expect(snapshotRef.current!.bubble.rawPoint).toEqual([x, y])
      expect(snapshotRef.current!.bubble.errorRadiusPx).toBe(200)
      expect(snapshotRef.current!.bubble.verified).toBe(false)
      const drawing: unknown[][] = []
      const context = {
        save() {},
        restore() {},
        beginPath() {},
        stroke() {},
        translate(...args: number[]) {
          drawing.push(["translate", ...args])
        },
        rotate(...args: number[]) {
          drawing.push(["rotate", ...args])
        },
        moveTo(...args: number[]) {
          drawing.push(["moveTo", ...args])
        },
        lineTo(...args: number[]) {
          drawing.push(["lineTo", ...args])
        },
        fillText(...args: unknown[]) {
          drawing.push(["text", ...args])
        },
        arc(...args: number[]) {
          drawing.push(["arc", ...args])
        },
      } as unknown as CanvasRenderingContext2D
      drawGazeBubbleOverlay(
        context,
        snapshotRef.current!,
        view.width,
        view.height
      )
      expect(drawing).toContainEqual(["translate", expectedLeft, expectedTop])
      expect(drawing).toContainEqual(["rotate", (angle * Math.PI) / 180])
      expect(drawing.some(([operation]) => operation === "arc")).toBe(false)
      expect(
        drawing.some(
          ([operation, text]) =>
            operation === "text" && text === "Gaze estimate outside screen"
        )
      ).toBe(true)
      expect(
        drawing.some(
          ([operation, text]) =>
            operation === "text" &&
            String(text).includes("Calibration error is larger than the bubble")
        )
      ).toBe(true)
      now = 1995
      await act(async () =>
        root.render(
          createElement(GazeBubbleOverlay, { ...base, verified: false })
        )
      )
      now = 2001
      await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
      expect(host.querySelector(".gaze-edge-indicator")).toBeNull()
      expect(snapshotRef.current).toBeNull()
    } finally {
      await act(async () => root.unmount())
      host.remove()
      clock.mockRestore()
    }
  }
)

test("remote overlay uses source age for sparse inference and clears snapshots on expiry or loss", async () => {
  let now = 1500
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const snapshotRef = { current: null as GazeBubbleOverlaySnapshot | null }
  const base = {
    point: [0.5, 0.5] as [number, number],
    timestamp: 1000,
    profile: "remote-adaptive" as const,
    stabilize: false,
    snapshotRef,
  }
  try {
    await act(async () => root.render(createElement(GazeBubbleOverlay, base)))
    expect(host.querySelector(".gaze-bubble")).not.toBeNull()
    expect(snapshotRef.current?.bubble.rawPoint).toEqual(base.point)
    now = 1995
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, { ...base, errorRadiusPx: 1000 })
      )
    )
    expect(host.querySelector(".gaze-bubble")).not.toBeNull()
    now = 2001
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    expect(snapshotRef.current).toBeNull()
    now = 2100
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          point: [0.8, 0.2],
          timestamp: now,
        })
      )
    )
    expect(snapshotRef.current!.bubble.center[0]).toBeCloseTo(0.8, 10)
    expect(snapshotRef.current!.bubble.center[1]).toBeCloseTo(0.2, 10)
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          point: null,
          timestamp: now,
        })
      )
    )
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    expect(snapshotRef.current).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
  }
})

test("remote overlay hides blink readings and resumes smoothing without displaying cached gaze", async () => {
  let now = 1000
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const snapshotRef = { current: null as GazeBubbleOverlaySnapshot | null }
  const base = {
    point: [0.5, 0.5] as [number, number],
    timestamp: now,
    profile: "remote-adaptive" as const,
    stabilize: false,
    snapshotRef,
  }
  try {
    await act(async () => root.render(createElement(GazeBubbleOverlay, base)))
    now = 1200
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          point: null,
          timestamp: now,
        })
      )
    )
    expect(host.querySelector(".gaze-bubble")).toBeNull()
    expect(snapshotRef.current).toBeNull()
    now = 1250
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          point: [0.51, 0.5],
          timestamp: now,
        })
      )
    )
    expect(snapshotRef.current!.bubble.center[0]).toBeGreaterThan(0.5)
    expect(snapshotRef.current!.bubble.center[0]).toBeLessThan(0.51)
    expect(snapshotRef.current!.bubble.rawPoint).toEqual([0.51, 0.5])
    now = 1600
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          point: null,
          timestamp: 1550,
        })
      )
    )
    expect(snapshotRef.current).toBeNull()
    now = 2400
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, {
          ...base,
          point: [0.52, 0.5],
          timestamp: 2050,
        })
      )
    )
    expect(snapshotRef.current!.bubble.center).toEqual([0.52, 0.5])
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
  }
})

test("remote coordinate offsets and source/calibration resets drop old filter history", async () => {
  let now = 1000
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const snapshotRef = { current: null as GazeBubbleOverlaySnapshot | null }
  const base = {
    point: [0.5, 0.5] as [number, number],
    timestamp: now,
    profile: "remote-adaptive" as const,
    stabilize: false,
    resetKey: {},
    snapshotRef,
  }
  try {
    await act(async () => root.render(createElement(GazeBubbleOverlay, base)))
    now = 1200
    const moved = {
      ...base,
      point: [0.51, 0.5] as [number, number],
      timestamp: now,
    }
    await act(async () => root.render(createElement(GazeBubbleOverlay, moved)))
    expect(snapshotRef.current!.bubble.center[0]).toBeLessThan(0.51)
    expect(snapshotRef.current!.bubble.rawPoint).toEqual(moved.point)
    await act(async () =>
      root.render(
        createElement(GazeBubbleOverlay, { ...moved, offset: [0.01, 0] })
      )
    )
    expect(snapshotRef.current!.bubble.center).toEqual(moved.point)
    now = 1400
    const next = {
      ...moved,
      point: [0.52, 0.5] as [number, number],
      timestamp: now,
      offset: [0.01, 0] as [number, number],
    }
    await act(async () => root.render(createElement(GazeBubbleOverlay, next)))
    expect(snapshotRef.current!.bubble.center[0]).toBeLessThan(0.52)
    await act(async () =>
      root.render(createElement(GazeBubbleOverlay, { ...next, resetKey: {} }))
    )
    expect(snapshotRef.current!.bubble.center).toEqual(next.point)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    clock.mockRestore()
  }
})
