import type {
  CalibrationComparison,
  CalibrationConditionComparison,
  CalibrationGate,
  CalibrationRunSummary,
} from "./calibration-comparison.types"
/** Numerical promotion gates require measured device runs; synthetic fixtures are insufficient. */
export function compareCalibrationRuns(
  baseline: CalibrationRunSummary,
  candidate: CalibrationRunSummary
): CalibrationComparison {
  const baselineIds = [...new Set(baseline.conditionIds)].sort()
  const candidateIds = [...new Set(candidate.conditionIds)].sort()
  const matchingConditions =
    baselineIds.length > 1 &&
    baselineIds.includes("stationary") &&
    JSON.stringify(baselineIds) === JSON.stringify(candidateIds)
  const conditions: CalibrationConditionComparison[] = baselineIds.map(
    (conditionId) => {
      const before = baseline.metrics.conditions.find(
        (condition) => condition.conditionId === conditionId
      )
      const after = candidate.metrics.conditions.find(
        (condition) => condition.conditionId === conditionId
      )
      const baselineRms = before?.rmsPixels ?? null
      const candidateRms = after?.rmsPixels ?? null
      let limit = baselineRms ?? 0
      if (conditionId === "stationary") {
        limit *= 1.1
      }
      const passed =
        baselineRms !== null &&
        candidateRms !== null &&
        before!.validFraction >= 0.9 &&
        after!.validFraction >= 0.9 &&
        candidateRms <= limit
      return { conditionId, baselineRms, candidateRms, passed }
    }
  )
  const motion = conditions.filter(
    (condition) => condition.conditionId !== "stationary"
  )
  let motionImprovement = motion.length > 0
  const baselineMotion = Math.sqrt(
    motion.reduce(
      (sum, condition) => sum + (condition.baselineRms ?? 0) ** 2,
      0
    ) / motion.length
  )
  const candidateMotion = Math.sqrt(
    motion.reduce(
      (sum, condition) => sum + (condition.candidateRms ?? 0) ** 2,
      0
    ) / motion.length
  )
  motionImprovement =
    motionImprovement &&
    motion.every((condition) => condition.passed) &&
    baselineMotion > 1e-6 &&
    candidateMotion <= baselineMotion * 0.75
  const targetsMatched =
    baseline.metrics.targets.length > 0 &&
    baseline.metrics.targets.length === candidate.metrics.targets.length &&
    baseline.metrics.targets.every((before) => {
      const after = candidate.metrics.targets.find(
        (target) =>
          target.targetId === before.targetId &&
          target.target.every((value, axis) => value === before.target[axis])
      )
      return (
        !!after &&
        before.rmsPixels !== null &&
        after.rmsPixels !== null &&
        before.validFraction >= 0.9 &&
        after.validFraction >= 0.9 &&
        after.rmsPixels <= before.rmsPixels * 1.1
      )
    })
  const gates: CalibrationGate[] = [
    { id: "target-coverage-and-error", passed: targetsMatched },
    {
      id: "matching-conditions",
      passed:
        matchingConditions && conditions.every((condition) => condition.passed),
    },
    {
      id: "output-coverage",
      passed:
        baseline.metrics.validFraction >= 0.9 &&
        candidate.metrics.validFraction >= 0.9,
    },
    {
      id: "sustained-fps",
      passed:
        Number.isFinite(baseline.inferenceFps) &&
        baseline.inferenceFps > 0 &&
        Number.isFinite(candidate.inferenceFps) &&
        candidate.inferenceFps >= baseline.inferenceFps * 0.9,
    },
    {
      id: "inference-delay",
      passed:
        Number.isFinite(baseline.p95InferenceMs) &&
        baseline.p95InferenceMs >= 0 &&
        Number.isFinite(candidate.p95InferenceMs) &&
        candidate.p95InferenceMs >= 0 &&
        candidate.p95InferenceMs <= baseline.p95InferenceMs + 20,
    },
    { id: "motion-improvement", passed: motionImprovement },
  ]
  return { passed: gates.every((gate) => gate.passed), gates, conditions }
}
