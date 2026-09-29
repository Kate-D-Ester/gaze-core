import type { CalibrationSample } from "./eye-tracking.types"
import type { TrackerController } from "./use-tracker.types"

export type CalibrationOverlayProps = {
  tracker: TrackerController
  validation: boolean
  onComplete: (samples: CalibrationSample[]) => void
  onCancel: () => void
}
