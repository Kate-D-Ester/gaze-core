import type { RefObject } from "react"
import type {
  AdaptiveCalibrationResult,
  AdaptiveHeadCalibration,
} from "./adaptive-calibration.types"
import type { RemoteMode, RemoteObservation } from "./remote-eye-tracking.types"
export type AdaptiveCalibrationOverlayProps = {
  mode: RemoteMode
  latest: RefObject<RemoteObservation | null>
  headMovement: boolean
  headCalibration?: AdaptiveHeadCalibration
  onComplete: (result: AdaptiveCalibrationResult) => void
  onCancel: () => void
}
