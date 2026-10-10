export type CalibrationComparisonScore = {
  rms: number
  targets: { key: string; rms: number; jitter: number }[]
}

export type CalibrationComparisonOptions = {
  /** Compare boundary loss and recovery with the same fit; include between-state jitter. */
  landmarkFallbackEyes?: (0 | 1)[]
}
