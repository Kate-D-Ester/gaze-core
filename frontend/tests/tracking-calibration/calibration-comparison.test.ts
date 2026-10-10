import { expect, test } from "bun:test"
import { compareCalibrationRuns } from "../../research/calibration/calibration-comparison"
import { evaluateValidation } from "../../apps/web/src/features/tracking-calibration/validation-metrics"
import type { CalibrationRunSummary } from "../../research/calibration/calibration-comparison.types"
function run(error: number, dropped = 0): CalibrationRunSummary {
  const readings = ["stationary", "yaw", "pitch", "roll"].flatMap(
    (conditionId, index) =>
      Array.from({ length: 10 }, (_, frame) => ({
        timestamp: index * 10 + frame,
        targetId: index,
        target: [0.5, 0.5] as [number, number],
        point:
          frame < dropped ? null : ([0.5 + error, 0.5] as [number, number]),
        conditionId,
      }))
  )
  return {
    metrics: evaluateValidation(readings, { width: 1000, height: 1000 }),
    inferenceFps: 10,
    p95InferenceMs: 90,
    conditionIds: ["stationary", "yaw", "pitch", "roll"],
  }
}
test("better accepted error cannot hide lost output coverage", () => {
  expect(compareCalibrationRuns(run(0.02), run(0.01, 4)).passed).toBe(false)
  expect(compareCalibrationRuns(run(0.02), run(0.01)).passed).toBe(true)
})
test("every requested condition and sustained performance measurement is required", () => {
  expect(
    compareCalibrationRuns(run(0.02), {
      ...run(0.01),
      conditionIds: ["stationary"],
    }).passed
  ).toBe(false)
  expect(
    compareCalibrationRuns(run(0.02), { ...run(0.01), inferenceFps: 8 }).passed
  ).toBe(false)
  expect(
    compareCalibrationRuns(run(0.02), { ...run(0.01), p95InferenceMs: 120 })
      .passed
  ).toBe(false)
  expect(
    compareCalibrationRuns(run(0.02), { ...run(0.01), p95InferenceMs: NaN })
      .passed
  ).toBe(false)
})
test("a near-zero baseline never divides by zero or claims a measurable relative improvement", () => {
  const result = compareCalibrationRuns(run(0), run(0))
  expect(result.passed).toBe(false)
  expect(
    result.gates.find((gate) => gate.id === "motion-improvement")?.passed
  ).toBe(false)
})

test("a center improvement cannot conceal a peripheral target regression", () => {
  const conditions = ["stationary", "yaw"]
  const readings = conditions.flatMap((conditionId, condition) =>
    [0.2, 0.5, 0.8].map((x, targetId) => ({
      timestamp: condition * 3 + targetId,
      conditionId,
      targetId,
      target: [x, 0.5] as [number, number],
      point: [x + 0.04, 0.5] as [number, number],
    }))
  )
  const candidate = readings.map((reading) => ({
    ...reading,
    point: [reading.target[0] + [0, 0.05, 0.005][reading.targetId]!, 0.5] as [
      number,
      number,
    ],
  }))
  const baselineRun = {
    ...run(0.04),
    conditionIds: conditions,
    metrics: evaluateValidation(readings, { width: 1000, height: 1000 }),
  }
  const candidateRun = {
    ...run(0.01),
    conditionIds: conditions,
    metrics: evaluateValidation(candidate, { width: 1000, height: 1000 }),
  }
  expect(compareCalibrationRuns(baselineRun, candidateRun).passed).toBe(false)
})
