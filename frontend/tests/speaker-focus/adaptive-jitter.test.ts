import { expect, test } from "bun:test"
import { AdaptiveJitter } from "../../apps/web/src/features/speaker-focus/adaptive-jitter"
test("warm variation and arrival jitter determine reserve without a cap", () => {
  const jitter = new AdaptiveJitter(16000, 0.01, [0.5, 0.6, 0.9])
  expect(jitter.reserve).toBeCloseTo(0.3, 4)
  jitter.arrive(0, 1)
  jitter.arrive(11, 1)
  expect(jitter.reserve).toBeGreaterThan(9)
  jitter.reset()
  expect(jitter.reserve).toBeGreaterThan(9)
})
