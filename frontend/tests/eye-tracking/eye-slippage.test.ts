import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { TrackingEngine } from "../../apps/web/src/features/eye-tracking/engine"
import type {
  Detection,
  Ellipse,
  FrameSettings,
  Point,
  TrackerFormat,
  TrackingFrame,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type { CV } from "../../apps/web/src/features/eye-tracking/opencv.types"
import { PupilTracker } from "../../apps/web/src/features/eye-tracking/pupil-tracker"

const width = 320
const height = 240
const pixels = new Uint8ClampedArray(width * height * 4)

// Analytic weak-perspective projections of a circular pupil on a rotating eye.
// Translating its image changes centers only; physiological dilation changes axes only.
function pupil(index: number, translation: Point = [0, 0]): Ellipse {
  const angle = (index * Math.PI * 2) / 48
  const nx = 0.55 * Math.cos(angle)
  const ny = 0.45 * Math.sin(angle)
  return {
    center: [160 + 60 * nx + translation[0], 120 + 60 * ny + translation[1]],
    major: 18,
    minor: 18 * Math.sqrt(1 - nx * nx - ny * ny),
    angle: Math.atan2(ny, nx) + Math.PI / 2,
    confidence: 0.99,
  }
}

describe("near-eye translation compensation", () => {
  let detection: Detection
  let detector: ReturnType<typeof spyOn>
  let engine: TrackingEngine
  let settings: FrameSettings
  let frameId: number

  beforeEach(() => {
    frameId = 0
    // Detection is replaced at the vision boundary. Real pupil association,
    // model fitting, correction, and both gaze projections still run.
    detector = spyOn(PupilTracker.prototype, "detect").mockImplementation(
      () => detection
    )
    engine = new TrackingEngine({} as CV)
    settings = {
      format: "spatial",
      roi: { x: 0, y: 0, width, height },
      threshold: 0,
      thresholdMode: "auto",
      fov: 45,
      radiusMm: 12,
      corners: [
        [100, 120],
        [220, 120],
      ],
      locked: false,
    }
  })

  afterEach(() => detector.mockRestore())

  function observe(
    ellipse: Ellipse | null,
    shapeObserved = true
  ): TrackingFrame {
    const local = ellipse && {
      ...ellipse,
      center: [
        ellipse.center[0] - settings.roi.x,
        ellipse.center[1] - settings.roi.y,
      ] as Point,
    }
    detection = {
      ellipse: local,
      shapeObserved,
      strongEvidence: true,
      seed: ellipse?.center ?? null,
      contour: [],
      refined: [],
      previews: [],
      selected: -1,
      reason: ellipse ? "Pupil found" : "Pupil not found",
    }
    frameId++
    return engine.process(
      pixels,
      width,
      height,
      settings,
      frameId,
      frameId * 40,
      false
    )
  }

  function sweep(translation: Point = [0, 0], count = 144): TrackingFrame {
    let frame = observe(pupil(0, translation))
    for (let index = 1; index < count; index++) {
      frame = observe(pupil(index, translation))
    }
    return frame
  }

  function lock(format: TrackerFormat = "spatial"): TrackingFrame {
    settings.format = format
    sweep([0, 0], 96)
    settings.locked = true
    return observe(pupil(0))
  }

  it.each(["classic", "spatial"] as const)(
    "%s corrects a supported image translation in the measured gaze while retaining raw pupil evidence",
    (format) => {
      const baseline = lock(format)
      expect(baseline.gaze).not.toBeNull()
      sweep([8, -6])
      const corrected = observe(pupil(0, [8, -6]))

      expect(corrected.gaze!.direction[0]).toBeCloseTo(
        baseline.gaze!.direction[0],
        5
      )
      expect(corrected.gaze!.direction[1]).toBeCloseTo(
        baseline.gaze!.direction[1],
        5
      )
      expect(corrected.detection.ellipse!.center).toEqual([201, 114])
      expect(corrected.model).toEqual(baseline.model)
      expect(corrected.slippage?.status).toBe("compensated")
      expect(corrected.slippage?.offset[0]).toBeCloseTo(8, 5)
      expect(corrected.slippage?.offset[1]).toBeCloseTo(-6, 5)
    }
  )

  it("does not absorb real eye rotation or pupil dilation into camera motion", () => {
    const baseline = lock()
    for (let index = 0; index < 160; index++) {
      const ellipse = pupil(index)
      const dilation = 0.8 + (0.4 * (1 + Math.sin(index / 12))) / 2
      observe({
        ...ellipse,
        major: ellipse.major * dilation,
        minor: ellipse.minor * dilation,
      })
    }
    const returned = observe(pupil(0))
    expect(returned.slippage?.offset).toEqual([0, 0])
    expect(returned.gaze!.direction).toEqual(baseline.gaze!.direction)
    const rotated = observe(pupil(12))
    expect(rotated.gaze!.direction[1]).not.toBeCloseTo(
      baseline.gaze!.direction[1],
      2
    )
  })

  it("requires diverse gaze directions instead of learning a fixation or line as slippage", () => {
    lock()
    for (let index = 0; index < 144; index++) {
      const x = 130 + (index % 30) * 2
      observe({ ...pupil(0), center: [x, 110], angle: Math.PI / 2 })
    }
    const frame = observe(pupil(0, [8, -6]))
    expect(frame.slippage?.offset).toEqual([0, 0])
    expect(frame.gaze).not.toBeNull()
  })

  it("never learns from inferred partial outlines, tiny pupils, or weak fits", () => {
    lock()
    for (let index = 0; index < 144; index++) {
      observe(pupil(index, [8, -6]), false)
    }
    for (let index = 0; index < 144; index++) {
      observe({ ...pupil(index, [8, -6]), major: 3, minor: 2 })
    }
    for (let index = 0; index < 144; index++) {
      observe({ ...pupil(index, [8, -6]), confidence: 0.8 })
    }
    const frame = observe(pupil(0, [8, -6]))
    expect(frame.slippage?.offset).toEqual([0, 0])
    expect(frame.gaze).not.toBeNull()
  })

  it("does not accept one short inconsistent window as camera movement", () => {
    lock()
    sweep([8, -6], 24)
    const frame = observe(pupil(0))
    expect(frame.slippage?.offset).toEqual([0, 0])
    sweep()
    expect(observe(pupil(0)).slippage?.offset).toEqual([0, 0])
  })

  it.each([false, true])(
    "does not lock a single biased reference window (earlier confirmed baseline: %s)",
    (earlierBaseline) => {
      settings.format = "classic"
      if (earlierBaseline) {
        sweep([0, 0], 96)
      }
      for (let index = 0; index < 24; index++) {
        const ellipse = pupil(index * 2)
        observe({
          ...ellipse,
          angle:
            Math.atan2(ellipse.center[1] - 114, ellipse.center[0] - 168) +
            Math.PI / 2,
        })
      }
      settings.locked = true
      sweep([0, 0], 96)
      const unchanged = observe(pupil(0))
      expect(unchanged.slippage?.offset).toEqual([0, 0])
      expect(unchanged.gaze!.direction[0]).toBeCloseTo(0.55, 5)
      expect(unchanged.gaze!.direction[1]).toBeCloseTo(0, 5)
    }
  )

  it("requires independent agreement for a baseline first collected after lock", () => {
    settings.format = "classic"
    settings.locked = true
    for (let index = 0; index < 24; index++) {
      const ellipse = pupil(index * 2)
      observe({
        ...ellipse,
        angle:
          Math.atan2(ellipse.center[1] - 114, ellipse.center[0] - 168) +
          Math.PI / 2,
      })
    }
    sweep([0, 0], 96)
    const unchanged = observe(pupil(0))
    expect(unchanged.slippage?.offset).toEqual([0, 0])
    expect(unchanged.gaze!.direction[0]).toBeCloseTo(0.55, 5)
    expect(unchanged.gaze!.direction[1]).toBeCloseTo(0, 5)
  })

  it("rejects noisy ellipse directions even when pupil centers cover two dimensions", () => {
    lock()
    for (let index = 0; index < 192; index++) {
      const ellipse = pupil(index, [8, -6])
      observe({
        ...ellipse,
        angle: ellipse.angle + 0.25 * Math.sin(index * 2.2),
      })
    }
    expect(observe(pupil(0, [8, -6])).slippage?.offset).toEqual([0, 0])
  })

  it("does not treat repeated timestamps as independent supporting frames", () => {
    lock()
    for (let index = 0; index < 144; index++) {
      frameId--
      observe(pupil(index, [8, -6]))
    }
    expect(observe(pupil(0, [8, -6])).slippage?.offset).toEqual([0, 0])
  })

  it("compensates in full-frame coordinates when the eye is cropped", () => {
    settings.roi = { x: 40, y: 30, width: 240, height: 180 }
    const baseline = lock("classic")
    sweep([8, -6])
    const corrected = observe(pupil(0, [8, -6]))
    expect(corrected.detection.ellipse!.center).toEqual([161, 84])
    expect(corrected.slippage?.offset[0]).toBeCloseTo(8, 5)
    expect(corrected.gaze!.direction[0]).toBeCloseTo(
      baseline.gaze!.direction[0],
      5
    )
    expect(corrected.gaze!.direction[1]).toBeCloseTo(
      baseline.gaze!.direction[1],
      5
    )
  })

  it("retains an accepted correction through dropout without producing stale gaze", () => {
    const baseline = lock()
    sweep([8, -6])
    for (let index = 0; index < 80; index++) {
      const lost = observe(null)
      expect(lost.gaze).toBeNull()
      expect(lost.slippage?.offset[0]).toBeCloseTo(8, 5)
    }
    const resumed = observe(pupil(0, [8, -6]))
    expect(resumed.gaze!.direction[0]).toBeCloseTo(
      baseline.gaze!.direction[0],
      5
    )
  })

  it("bounds correction instead of silently absorbing a large geometry change", () => {
    lock("classic")
    const frame = sweep([45, 0])
    expect(frame.slippage?.status).toBe("limited")
    expect(frame.slippage?.offset).toEqual([0, 0])
    expect(frame.gaze).not.toBeNull()
  })

  it("does not claim to recover an earlier camera alignment without a runtime reference", () => {
    settings.format = "classic"
    settings.locked = true
    const first = observe(pupil(0, [8, -6]))
    expect(first.slippage?.status).toBe("collecting")
    sweep([8, -6])
    const current = observe(pupil(0, [8, -6]))
    expect(current.slippage?.offset).toEqual([0, 0])
    // A saved mapping's accuracy still needs rechecking; runtime collection
    // cannot infer where the camera was when that mapping was calibrated.
    expect(current.gaze!.direction[0]).toBeCloseTo(41 / 60, 5)
  })

  it("clears correction when setup changes or the model is unlocked", () => {
    lock("classic")
    sweep([8, -6])
    settings.locked = false
    expect(observe(pupil(0, [8, -6])).slippage?.offset).toEqual([0, 0])
    settings.locked = true
    sweep([8, -6])
    sweep([0, 0])
    expect(observe(pupil(0)).slippage?.offset[0]).toBeCloseTo(-8, 5)
    settings.threshold = 10
    expect(observe(pupil(0)).slippage?.offset).toEqual([0, 0])
  })
})
