import { describe, expect, it } from "bun:test"
import {
  EyeModelEstimator,
  getEyeModelLockStatus,
  getTrackerModelLockStatus,
} from "../../apps/web/src/features/eye-tracking/eye-model"
import { DEFAULT_SETTINGS } from "../../apps/web/src/features/eye-tracking/use-tracker"
import type {
  Ellipse,
  EyeModel,
} from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

const model = (overrides: Partial<EyeModel> = {}): EyeModel => ({
  center: [160, 120],
  radius: 40,
  residual: 2,
  samples: 95,
  coverage: 0.25,
  ready: false,
  ...overrides,
})

describe("eye model lock status", () => {
  it("allows an eyeball projection larger than a tight pupil crop", () => {
    expect(
      getEyeModelLockStatus(
        model({ coverage: 0.75, radius: 106, residual: 1 }),
        320,
        240,
        100,
        72
      ).ready
    ).toBe(true)
  })

  it("locks a valid manual model from its corners while waiting for the next frame", () => {
    expect(
      getTrackerModelLockStatus(
        {
          ...DEFAULT_SETTINGS,
          format: "classic",
          corners: [
            [100, 120],
            [220, 120],
          ],
        },
        { width: 320, height: 240 },
        null
      ).ready
    ).toBe(true)
  })

  it("does not lock missing or coincident manual corners using a stale frame", () => {
    for (const corners of [
      null,
      [
        [160, 120],
        [160, 120],
      ],
    ] as const) {
      const status = getTrackerModelLockStatus(
        {
          ...DEFAULT_SETTINGS,
          format: "classic",
          corners: corners ? [[...corners[0]], [...corners[1]]] : null,
        },
        { width: 320, height: 240 },
        model({ ready: true })
      )
      expect(status.ready).toBe(false)
      expect(status.blocker).toBe("corners")
    }
  })

  it("continues rejecting noisy fits and implausible full-frame model sizes", () => {
    expect(
      getEyeModelLockStatus(model({ coverage: 1, residual: 12 }), 320, 240)
        .ready
    ).toBe(false)
    expect(
      getEyeModelLockStatus(model({ coverage: 1, radius: 500 }), 320, 240).ready
    ).toBe(false)
  })

  it("explains that the gaze range needs broader directional coverage", () => {
    expect(getEyeModelLockStatus(model(), 320, 240)).toEqual({
      ready: false,
      blocker: "coverage",
      coveredDirections: 2,
      requiredDirections: 3,
      progress: 67,
    })
  })

  it("reports the same sample threshold used to make the model lockable", () => {
    expect(getEyeModelLockStatus(model({ samples: 12 }), 320, 240)).toEqual({
      ready: false,
      blocker: "samples",
      coveredDirections: 2,
      requiredDirections: 3,
      progress: 40,
    })
  })

  it("only reports ready when every lock criterion is satisfied", () => {
    expect(
      getEyeModelLockStatus(model({ coverage: 0.625 }), 320, 240)
    ).toMatchObject({
      ready: true,
      blocker: "ready",
      coveredDirections: 5,
      requiredDirections: 3,
      progress: 100,
    })
  })

  it("allows a stable model to lock after three distinct directions", () => {
    expect(
      getEyeModelLockStatus(
        model({ samples: 96, coverage: 0.375, residual: 5.7 }),
        640,
        480,
        204,
        122
      )
    ).toMatchObject({
      ready: true,
      blocker: "ready",
      coveredDirections: 3,
      requiredDirections: 3,
      progress: 100,
    })
  })

  it("keeps a previously ready model lockable", () => {
    expect(
      getEyeModelLockStatus(model({ ready: true, coverage: 0.25 }), 320, 240)
    ).toMatchObject({ ready: true, blocker: "ready", progress: 100 })
  })
})

describe("eye model collection", () => {
  const observation = (angle: number, orbitRadius: number): Ellipse => ({
    center: [
      160 + orbitRadius * Math.cos(angle),
      120 + orbitRadius * Math.sin(angle),
    ],
    major: 24,
    minor: 15,
    angle: angle + Math.PI / 2,
    confidence: 0.99,
  })

  it("recognizes a full pupil sweep with an off-axis eye camera", () => {
    const estimator = new EyeModelEstimator()
    // All pupil positions lie above the projected eyeball center. They still
    // span a complete two-dimensional sweep inside the selected eye region.
    for (let index = 0; index < 64; index++) {
      const angle = (index * Math.PI * 2) / 32
      const x = 160 + 24 * Math.cos(angle)
      const y = 100 + 16 * Math.sin(angle)
      estimator.observe(
        {
          center: [x, y],
          major: 15,
          minor: 10,
          angle: Math.atan2(y - 180, x - 160) + Math.PI / 2,
          confidence: 0.99,
        },
        320,
        240,
        100,
        72
      )
    }

    const fitted = estimator.getLatest()
    expect(fitted?.center[0]).toBeCloseTo(160, 5)
    expect(fitted?.center[1]).toBeCloseTo(180, 5)
    expect(fitted?.ready).toBe(true)
    expect(getEyeModelLockStatus(fitted, 320, 240, 100, 72).ready).toBe(true)
  })

  it.each([0, 0.5, 1, -1])("does not lock a one-dimensional sweep with slope %s", (slope) => {
    const estimator = new EyeModelEstimator()
    for (let index = 0; index < 64; index++) {
      const x = 160 + 24 * Math.sin((index * Math.PI) / 16)
      const y = 100 + slope * (x - 160)
      estimator.observe(
        {
          center: [x, y],
          major: 15,
          minor: 10,
          angle: Math.atan2(y - 180, x - 160) + Math.PI / 2,
          confidence: 0.99,
        },
        320,
        240,
        100,
        72
      )
    }
    expect(estimator.getLatest()?.ready).toBe(false)
  })

  it("recovers from early fits with an implausibly large radius", () => {
    const estimator = new EyeModelEstimator()
    for (let index = 0; index < 24; index++) {
      const angle = (index * Math.PI) / 12
      const x = 160 + 24 * Math.cos(angle)
      const y = 110 + 16 * Math.sin(angle)
      estimator.observe(
        {
          center: [x, y],
          major: 15,
          minor: 10,
          angle: Math.atan2(y - 2, x - 2) + Math.PI / 2,
          confidence: 0.99,
        },
        320,
        240,
        100,
        72
      )
    }
    for (let index = 0; index < 160; index++) {
      estimator.observe(
        observation((index * Math.PI) / 4, 24),
        320,
        240,
        100,
        72
      )
    }
    expect(estimator.getLatest()?.radius).toBeLessThan(60)
    expect(estimator.getLatest()?.ready).toBe(true)
  })

  it("keeps collected gaze coverage after the rolling fit window advances", () => {
    const estimator = new EyeModelEstimator()

    for (let index = 0; index < 40; index++) {
      const angle = (index * Math.PI * 2) / 8
      estimator.observe(observation(angle, 48), 320, 240)
    }

    const broadCoverage = estimator.getLatest()?.coverage ?? 0

    for (let index = 0; index < 120; index++) {
      const angle = index % 2 === 0 ? 0 : Math.PI / 2
      estimator.observe(observation(angle, 20), 320, 240)
    }

    expect(broadCoverage).toBe(1)
    expect(estimator.getLatest()?.coverage).toBe(1)
  })

  it("does not shrink the accepted gaze range after looking back to center", () => {
    const estimator = new EyeModelEstimator()

    for (let index = 0; index < 40; index++) {
      const angle = (index * Math.PI * 2) / 8
      estimator.observe(observation(angle, 48), 320, 240)
    }

    const broadRadius = estimator.getLatest()?.radius ?? 0

    for (let index = 0; index < 120; index++) {
      const angle = index % 2 === 0 ? 0 : Math.PI / 2
      estimator.observe(observation(angle, 20), 320, 240)
    }

    expect(estimator.getLatest()?.radius).toBeGreaterThanOrEqual(broadRadius)
  })

  it("measures movement against the selected eye region, not the full camera", () => {
    const estimator = new EyeModelEstimator()

    for (let index = 0; index < 40; index++) {
      const angle = (index * Math.PI * 2) / 8
      estimator.observe(observation(angle, 16), 1280, 720, 320, 160)
    }

    const model = estimator.getLatest()
    expect(model?.coverage).toBe(1)
    expect(getEyeModelLockStatus(model, 1280, 720, 320, 160)).toMatchObject({
      ready: true,
      blocker: "ready",
      progress: 100,
    })
  })

  it("clears collected range when rebuilding the model", () => {
    const estimator = new EyeModelEstimator()

    for (let index = 0; index < 40; index++) {
      const angle = (index * Math.PI * 2) / 8
      estimator.observe(observation(angle, 48), 320, 240)
    }

    estimator.reset()

    expect(estimator.getLatest()).toBeNull()
  })
})
