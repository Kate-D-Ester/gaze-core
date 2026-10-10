import type { ValidationMetrics } from "../../apps/web/src/features/tracking-calibration/validation-metrics.types"
export type CalibrationRunSummary = {
  metrics: ValidationMetrics
  inferenceFps: number
  p95InferenceMs: number
  conditionIds: string[]
}
export type CalibrationGate = { id: string; passed: boolean }
export type CalibrationConditionComparison = {
  conditionId: string
  baselineRms: number | null
  candidateRms: number | null
  passed: boolean
}
export type CalibrationComparison = {
  passed: boolean
  gates: CalibrationGate[]
  conditions: CalibrationConditionComparison[]
}
