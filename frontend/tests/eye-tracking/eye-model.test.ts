import { describe, expect, it } from "bun:test"
import {
  EyeModelEstimator,
  getEyeModelLockStatus,
} from "../../apps/web/src/features/eye-tracking/eye-model"
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
