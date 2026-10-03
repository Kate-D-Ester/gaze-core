import { expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { useCalibratedGaze } from "../../apps/web/src/features/eye-tracking/use-calibrated-gaze"
import { CalibrationDiagnostics } from "../../apps/web/src/features/eye-tracking/calibration-diagnostics"
import type {
  TrackingFrame,
  Vector3,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

if (typeof document === "undefined") GlobalRegistrator.register()
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
})

test("live diagnostics preserve stale source poses without falsely labeling them synchronized", async () => {
  let tick = () => {}
  let now = 1010
  const interval = spyOn(globalThis, "setInterval").mockImplementation(
    (callback) => {
      tick = callback as () => void
      return 1 as unknown as ReturnType<typeof setInterval>
    }
  )
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const diagnostics = new CalibrationDiagnostics()
  const eye = {
    current: {
      id: 1,
      timestamp: 1000,
      gaze: { direction: [0.2, 0.1, -1] },
      detection: { ellipse: { confidence: 0.9 } },
    } as TrackingFrame,
  }
  const head = {
    current: {
      id: 1,
      timestamp: 900,
      position: [0, 0, -50] as Vector3,
      rotation: [0, 0, 0] as Vector3,
    },
  }
  function GazeProbe() {
    useCalibratedGaze({
      calibration: {
        coefficients: [
          [0.5, 1, 0],
          [0.5, 0, 1],
        ],
        validationError: 0,
      },
      eye,
      head,
      onDiagnosticReading: (reading) => diagnostics.recordReading(reading),
    })
    return null
  }
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(GazeProbe)))
    await act(async () => tick())
    let reading = diagnostics.snapshot().readings[0]
    expect(reading.head?.timestamp).toBe(900)
    expect(reading.pairedHead).toBeNull()
    expect(reading.point).toEqual([0.7, 0.6])
    eye.current = {
      ...eye.current,
      id: 2,
      timestamp: 1040,
      gaze: { origin: [0, 0, 0], pupil: [0, 0, 0], direction: [1.2, 0.1, -1] },
    }
    now = 1050
    await act(async () => tick())
    reading = diagnostics.snapshot().readings.at(-1)!
    expect(reading.point).toEqual([1.7, 0.6])
    expect(reading.status).toBe("outside-screen")
  } finally {
    await act(async () => root.unmount())
    interval.mockRestore()
    clock.mockRestore()
  }
})

test("screen readings retain source timestamps and unsmoothed coordinates for the shared display layer", async () => {
  let tick = () => {}
  let now = 1010
  const interval = spyOn(globalThis, "setInterval").mockImplementation(
    (callback) => {
      tick = callback as () => void
      return 1 as unknown as ReturnType<typeof setInterval>
    }
  )
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const eye = {
    current: {
      id: 1,
      timestamp: 1000,
      gaze: { direction: [0.2, 0.1, -1] },
      detection: { ellipse: { confidence: 0.9 } },
    } as TrackingFrame,
  }
  const calibration = {
    coefficients: [
      [0.5, 1, 0],
      [0.5, 0, 1],
    ],
    validationError: 0,
  } as any
  let reading: ReturnType<typeof useCalibratedGaze>
  const head = { current: null }
  function Probe() {
    reading = useCalibratedGaze({ calibration, eye, head })
    return null
  }
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(Probe)))
    await act(async () => tick())
    expect(reading!.timestamp).toBe(1000)
    eye.current = {
      ...eye.current,
      id: 2,
      timestamp: 1040,
      gaze: {
        origin: [0, 0, 0],
        pupil: [0, 0, 0],
        direction: [0.205, 0.1, -1],
      },
    }
    now = 1050
    await act(async () => tick())
    expect(reading!.point).toEqual([0.705, 0.6])
    expect(reading!.timestamp).toBe(1040)
    now = 1100
    await act(async () => tick())
    expect(reading!.timestamp).toBe(1040)
  } finally {
    await act(async () => root.unmount())
    interval.mockRestore()
    clock.mockRestore()
  }
})
