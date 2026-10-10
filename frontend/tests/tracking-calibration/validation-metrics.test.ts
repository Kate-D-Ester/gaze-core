import { expect, test } from "bun:test"
import { evaluateValidation } from "../../apps/web/src/features/tracking-calibration/validation-metrics"
import type { ValidationReading } from "../../apps/web/src/features/tracking-calibration/validation-metrics.types"

test("opposing gaze errors do not disappear when their centroid is correct", () => {
  const readings: ValidationReading[] = [
    { timestamp: 1, targetId: 0, target: [0.5, 0.5], point: [0.48, 0.5] },
    { timestamp: 2, targetId: 0, target: [0.5, 0.5], point: [0.52, 0.5] },
  ]
  const result = evaluateValidation(readings, { width: 1920, height: 1080 })
  expect(result.biasPixels?.[0]).toBeCloseTo(0)
  expect(result.rmsPixels).toBeCloseTo(38.4)
  expect(result.jitterPixels).toBeCloseTo(38.4)
})

test("missing predictions contribute to attempted output coverage", () => {
  const readings: ValidationReading[] = []
  for (let index = 0; index < 10; index++) {
    readings.push({
      timestamp: index,
      targetId: 0,
      target: [0.5, 0.5],
      point: index === 0 ? [0.5, 0.5] : null,
      reason: index === 0 ? null : "unsupported-pose",
    })
  }
  const result = evaluateValidation(readings, { width: 1000, height: 500 })
  expect(result.attemptedCount).toBe(10)
  expect(result.sampleCount).toBe(1)
  expect(result.validFraction).toBe(0.1)
  expect(result.rejections["unsupported-pose"]).toBe(9)
})

test("jitter is measured within each fixation and targets have equal weight", () => {
  const readings: ValidationReading[] = [
    { timestamp: 1, targetId: 0, target: [0.2, 0.2], point: [0.3, 0.2] },
    { timestamp: 2, targetId: 0, target: [0.2, 0.2], point: [0.3, 0.2] },
    { timestamp: 3, targetId: 1, target: [0.8, 0.8], point: [0.8, 0.8] },
  ]
  const result = evaluateValidation(readings, { width: 1000, height: 500 })
  expect(result.meanPixels).toBeCloseTo(50)
  expect(result.rmsPixels).toBeCloseTo(Math.sqrt(5000))
  expect(result.jitterPixels).toBe(0)
})

test("invalid viewports and all-rejected captures have unavailable accuracy", () => {
  const input: ValidationReading[] = [
    { timestamp: 1, targetId: 0, target: [0.5, 0.5], point: null },
  ]
  expect(
    evaluateValidation(input, { width: NaN, height: 500 }).rmsPixels
  ).toBeNull()
  const rejected = evaluateValidation(input, { width: 1000, height: 500 })
  expect(rejected.rmsPixels).toBeNull()
  expect(rejected.validFraction).toBe(0)
})

test("duplicate timestamps, nonfinite points and stale observations cannot inflate scores", () => {
  const input: ValidationReading[] = [
    { timestamp: 10, targetId: 0, target: [0.5, 0.5], point: [0.5, 0.5] },
    { timestamp: 10, targetId: 0, target: [0.5, 0.5], point: [0.5, 0.5] },
    { timestamp: 9, targetId: 0, target: [0.5, 0.5], point: [0.5, 0.5] },
    { timestamp: 11, targetId: 0, target: [0.5, 0.5], point: [Infinity, 0.5] },
  ]
  const result = evaluateValidation(input, { width: 1000, height: 500 })
  expect(result.sampleCount).toBe(1)
  expect(result.attemptedCount).toBe(2)
  expect(result.validFraction).toBe(0.5)
})
