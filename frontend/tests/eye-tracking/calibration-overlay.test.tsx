import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { CalibrationOverlay } from "../../apps/web/src/features/eye-tracking/calibration-overlay"
import { LiveGazeOverlay } from "../../apps/web/src/features/eye-tracking/live-gaze-overlay"
import type {
  Point,
  TrackingFrame,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type { HeadTrackingController } from "../../apps/web/src/features/eye-tracking/head-tracking/use-head-tracking.types"
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"
import {
  fixtureCalibrationSamples,
  fixtureReference,
} from "./head-motion-fixture"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
})
const host = document.createElement("div")
let root: ReturnType<typeof createRoot>
const head: HeadTrackingController = {
  enabled: false,
  status: "off",
  pose: null,
  stream: null,
  error: "",
  latest: { current: null },
  history: { current: [] },
  transform: { rotation: 0, mirrorX: false, mirrorY: false },
  setTransform() {},
  start: async () => {},
  stop: () => {},
}

afterEach(async () => {
  await act(async () => root.unmount())
  host.replaceChildren()
  host.remove()
})

test("calibration waits for Start, preserves modal focus, and supports Escape cancellation", async () => {
  const setTarget = mock(() => {})
  const cancel = mock(() => {})
  const complete = mock(() => {})
  const tracker = {
    latest: { current: null },
    setSampleTarget: setTarget,
    source: null,
  } as unknown as TrackerController
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(CalibrationOverlay, {
        tracker,
        head,
        calibration: null,
        validation: false,
        onCancel: cancel,
        onComplete: complete,
      })
    )
  })
  expect(host.querySelector(".eye-calibration-target")).toBeNull()
  const start = host.querySelector<HTMLButtonElement>(".eye-calibration-start")!
  expect(start.textContent).toContain("Start calibration")
  await act(async () => start.click())
  const target = host.querySelector<HTMLElement>(".eye-calibration-target")!
  expect(target.style.left).toBe("50%")
  expect(target.style.top).toBe("50%")
  expect(setTarget).toHaveBeenCalledWith([0.5, 0.5])
  const calibrationPosition = [target.style.left, target.style.top]
  const close = host.querySelector<HTMLButtonElement>(
    '[aria-label="Cancel calibration"]'
  )!
  expect(document.activeElement).toBe(close)
  await act(async () =>
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(complete).not.toHaveBeenCalled()
  await act(async () =>
    root.render(
      createElement(LiveGazeOverlay, {
        point: [0.5, 0.5],
        title: "Look around.",
        head,
        simulated: false,
        onClose: cancel,
      })
    )
  )
  const dot = host.querySelector<HTMLElement>(".eye-live-dot")!
  expect([dot.style.left, dot.style.top]).toEqual(calibrationPosition)
})

test.each(
  (
    [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
      [0.1, 0.9],
    ] as Point[]
  ).map((point) => ({ point }))
)(
  "OpenGaze uses viewport coordinates without an inset or a second mirror: %j",
  async ({ point }) => {
    document.body.append(host)
    await act(async () => {
      root = createRoot(host)
      root.render(
        createElement(LiveGazeOverlay, {
          point,
          title: "Look around.",
          head,
          simulated: false,
          onClose() {},
        })
      )
    })
    const dot = host.querySelector<HTMLElement>(".eye-live-dot")!
    expect(Number.parseFloat(dot.style.left)).toBeCloseTo(point[0] * 100)
    expect(Number.parseFloat(dot.style.top)).toBeCloseTo(point[1] * 100)
    expect(dot.parentElement?.className).toBe("eye-focus-view")
  }
)

test("head preview stays visible during the initial grid", async () => {
  const pose = {
    id: 1,
    timestamp: 1000,
    position: [0, 0, -50],
    rotation: [0, 0, 0],
  }
  const active = {
    ...head,
    enabled: true,
    status: "tracking",
    pose,
    latest: { current: pose },
    history: { current: [pose] },
  } as HeadTrackingController
  const tracker = {
    latest: { current: null },
    setSampleTarget: () => {},
    source: null,
  } as unknown as TrackerController
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(CalibrationOverlay, {
        tracker,
        head: active,
        calibration: null,
        validation: false,
        onCancel: () => {},
        onComplete: () => {},
      })
    )
  })
  expect(
    host.querySelector('[aria-label="Head tracking preview"]')
  ).not.toBeNull()
  const start = host.querySelector<HTMLButtonElement>(".eye-calibration-start")!
  await act(async () => start.click())
  expect(
    host.querySelector('[aria-label="Head tracking preview"]')
  ).not.toBeNull()
  expect(host.querySelector('[data-head-vector="forward"]')).not.toBeNull()
})

test("the recovery overlay offers only the head pass while keeping the saved gaze dots", async () => {
  const active = {
    ...head,
    enabled: true,
    status: "tracking",
    pose: fixtureReference,
    latest: { current: fixtureReference },
    history: { current: [fixtureReference] },
  } as HeadTrackingController
  const tracker = {
    latest: { current: null },
    setSampleTarget: () => {},
    source: null,
  } as unknown as TrackerController
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(CalibrationOverlay, {
        tracker,
        head: active,
        calibration: null,
        validation: false,
        seedSamples: fixtureCalibrationSamples().slice(0, 9),
        onCancel() {},
        onComplete() {},
      })
    )
  })
  expect(host.querySelector("h2")?.textContent).toBe("Retry head movements")
  const start = host.querySelector<HTMLButtonElement>(".eye-calibration-start")!
  await act(async () => start.click())
  expect(host.querySelector(".eye-calibration-top span")?.textContent).toBe(
    "HEAD MOVEMENT · 1 / 12"
  )
})

test("validating an eye-only fallback does not require a usable front-camera pose", async () => {
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(CalibrationOverlay, {
        tracker: {
          latest: { current: null },
          setSampleTarget() {},
          source: null,
        } as unknown as TrackerController,
        head: { ...head, enabled: true, status: "lost" },
        calibration: {
          coefficients: [
            [0, 1, 0],
            [0, 0, 1],
          ],
          validationError: 0,
        },
        validation: true,
        onCancel() {},
        onComplete() {},
      })
    )
  })
  expect(
    host.querySelector<HTMLButtonElement>(".eye-calibration-start")?.disabled
  ).toBe(false)
})

test("a completed capture cannot submit a second fit when its camera effect restarts", async () => {
  let tick = () => {}
  let now = 0
  let target: Point = [0.5, 0.5]
  const interval = spyOn(globalThis, "setInterval").mockImplementation(
    (callback) => {
      tick = callback as () => void
      return 1 as unknown as ReturnType<typeof setInterval>
    }
  )
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const complete = mock(() => {})
  const tracker = {
    latest: { current: null as TrackingFrame | null },
    setSampleTarget(value: Point | null) {
      if (value) target = value
    },
    source: null,
  } as unknown as TrackerController
  const props = {
    tracker,
    head,
    calibration: null,
    validation: false,
    onCancel() {},
    onComplete: complete,
  }
  document.body.append(host)
  try {
    await act(async () => {
      root = createRoot(host)
      root.render(createElement(CalibrationOverlay, props))
    })
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".eye-calibration-start")!.click()
    )
    for (; now < 30000 && complete.mock.calls.length === 0; now += 100) {
      tracker.latest.current = {
        id: now,
        timestamp: now,
        gaze: {
          direction: [-(target[0] - 0.5) / 2, (target[1] - 0.5) / 3, -1],
        },
        detection: { ellipse: { confidence: 0.9 } },
      } as TrackingFrame
      await act(async () => tick())
    }
    expect(complete).toHaveBeenCalledTimes(1)
    await act(async () =>
      root.render(
        createElement(CalibrationOverlay, {
          ...props,
          head: { ...head, enabled: true, status: "lost" },
        })
      )
    )
    await act(async () => tick())
    expect(complete).toHaveBeenCalledTimes(1)
  } finally {
    interval.mockRestore()
    clock.mockRestore()
  }
})

test("diagnostics record a rejected head/eye pair before calibration gating discards it", async () => {
  let tick = () => {}
  const interval = spyOn(globalThis, "setInterval").mockImplementation(
    (callback) => {
      tick = callback as () => void
      return 1 as unknown as ReturnType<typeof setInterval>
    }
  )
  const clock = spyOn(performance, "now").mockReturnValue(1000)
  const record = mock(() => {})
  const pose = { ...fixtureReference, id: 1, timestamp: 900 }
  const eye = {
    id: 1,
    timestamp: 990,
    gaze: { direction: [0, 0, -1] },
    detection: { ellipse: { confidence: 0.9 } },
  } as TrackingFrame
  document.body.append(host)
  try {
    await act(async () => {
      root = createRoot(host)
      root.render(
        createElement(CalibrationOverlay, {
          tracker: {
            latest: { current: eye },
            source: null,
            setSampleTarget() {},
          } as unknown as TrackerController,
          head: {
            ...head,
            enabled: true,
            status: "tracking",
            pose,
            latest: { current: pose },
            history: { current: [pose] },
          },
          calibration: null,
          validation: false,
          onComplete() {},
          onCancel() {},
          onDiagnosticReading: record,
        })
      )
    })
    await act(async () => tick())
    expect(record).not.toHaveBeenCalled()
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".eye-calibration-start")!.click()
    )
    await act(async () => tick())
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0][0]).toMatchObject({
      mode: "calibration",
      eye,
      head: pose,
      pairedHead: null,
      status: "unpaired",
      target: [0.5, 0.5],
    })
    expect(host.textContent).toContain("Face lost")
  } finally {
    interval.mockRestore()
    clock.mockRestore()
  }
})
