import type { Calibration, Point } from "../eye-tracking.types"
import type { TrackerController } from "../use-tracker.types"

export type LiveControlsProps = {
  tracker: TrackerController
  calibration: Calibration | null
  screenPoint: Point | null
  validation: number | null
  usable: boolean
  onFocus: () => void
  onValidate: () => void
  onRecalibrate: () => void
  onExport: () => void
}
