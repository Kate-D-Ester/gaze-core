import type { CalibrationSample, GazeOrientation } from "./calibration.types"
import type { CalibrationFitResult } from "./calibration-result.types"

export type CalibrationFitRequest = {
  samples: CalibrationSample[]
  orientation: GazeOrientation
  screenAspectRatio: number
}
export type CalibrationFitResponse = CalibrationFitResult & {
  error: string
}
