import { expect, test } from "bun:test"
import { evaluateValidation } from "../../apps/web/src/features/tracking-calibration/validation-metrics"
import { assessValidation } from "../../apps/web/src/features/tracking-calibration/validation-assessment"

const viewport = { width: 1200, height: 800 }
function readings(error = 0) {
  return Array.from({ length: 5 }, (_, targetId) =>
    Array.from({ length: 18 }, (_, frame) => ({
      timestamp: targetId * 10000 + frame * 100,
      targetId,
      target: [0.5, 0.5] as [number, number],
      point: [0.5 + error, 0.5] as [number, number],
    }))
  ).flat()
}
test("complete independent measurements can be checked, but finite inaccurate results cannot", () => {
  expect(
    assessValidation(evaluateValidation(readings(), viewport), viewport, 5, 18)
      .status
  ).toBe("checked")
  expect(
    assessValidation(
      evaluateValidation(readings(0.12), viewport),
      viewport,
      5,
      18
    ).status
  ).toBe("limited")
})
test("missing targets, low sample counts and outages are incomplete, never checked", () => {
  const samples = readings()
  expect(
    assessValidation(
      evaluateValidation(samples.slice(0, 72), viewport),
      viewport,
      5,
      18
    ).status
  ).toBe("incomplete")
  expect(
    assessValidation(
      evaluateValidation(
        samples.filter((_, i) => i % 18 < 3),
        viewport
      ),
      viewport,
      5,
      18
    ).status
  ).toBe("incomplete")
  const outages = samples.map((sample, index) => ({
    ...sample,
    point: index % 3 ? sample.point : null,
  }))
  expect(
    assessValidation(evaluateValidation(outages, viewport), viewport, 5, 18)
      .status
  ).toBe("incomplete")
  expect(assessValidation(null, viewport, 5).status).toBe("not-checked")
})
test("a bad peripheral target cannot hide behind a low overall mean", () => {
  const samples = readings().map((sample) => {
    if (sample.targetId === 4)
      return { ...sample, point: [0.6, 0.5] as [number, number] }
    return sample
  })
  expect(
    assessValidation(evaluateValidation(samples, viewport), viewport, 5, 18)
      .status
  ).toBe("limited")
})

test("aggregate-only scores cannot claim coverage of every target", () => {
  const metrics = evaluateValidation(readings(), viewport)
  const { targets, ...aggregate } = metrics
  expect(targets).toHaveLength(5)
  expect(assessValidation(aggregate, viewport, 5, 18).status).toBe("incomplete")
})
