import type {
  CalibrationSample,
  RemoteObservation,
} from "./remote-eye-tracking.types"
export type TargetCollectorOptions = {
  minimumSamples: number
  minimumDurationMs: number
  canComplete?: (samples: CalibrationSample[]) => boolean
  accepts?: (
    observation: RemoteObservation,
    samples: CalibrationSample[]
  ) => boolean
  resetOnInvalid?: boolean
}
