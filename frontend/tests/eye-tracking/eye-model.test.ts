import { describe, expect, it } from "bun:test"
import { getEyeModelLockStatus } from "../../apps/web/src/features/eye-tracking/eye-model"
import type { EyeModel } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

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
      requiredDirections: 5,
      progress: 40,
    })
  })

  it("reports the same sample threshold used to make the model lockable", () => {
    expect(getEyeModelLockStatus(model({ samples: 12 }), 320, 240)).toEqual({
      ready: false,
      blocker: "samples",
      coveredDirections: 2,
      requiredDirections: 5,
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
      requiredDirections: 5,
      progress: 100,
    })
  })

  it("keeps a previously ready model lockable", () => {
    expect(
      getEyeModelLockStatus(model({ ready: true, coverage: 0.25 }), 320, 240)
    ).toMatchObject({ ready: true, blocker: "ready", progress: 100 })
  })
})
