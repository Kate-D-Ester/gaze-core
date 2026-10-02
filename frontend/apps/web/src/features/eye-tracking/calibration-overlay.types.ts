import type { DiagnosticReadingInput } from "./calibration-diagnostics.types"
import type {
  Calibration,
  CalibrationSample,
  GazeOrientation,
} from "./calibration.types"
import type { HeadTrackingController } from "./head-tracking/use-head-tracking.types"
import type { TrackerController } from "./use-tracker.types"

export type CalibrationOverlayProps = {
  tracker: TrackerController
  head: HeadTrackingController
  calibration: Calibration | null
  orientation?: GazeOrientation
  validation: boolean
  fitting?: boolean
  seedSamples?: CalibrationSample[]
  onComplete: (samples: CalibrationSample[]) => void
  onDiagnosticReading?: (reading: DiagnosticReadingInput) => void
  onCancel: () => void
}
