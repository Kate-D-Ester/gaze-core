import type { RefObject } from "react"
import type {
  CalibrationSample,
  RemoteCalibration,
  RemoteObservation,
} from "./types"

export type CaptureViewport = {
  width: number
  height: number
}

export type RemoteCalibrationOverlayProps = {
  latest: RefObject<RemoteObservation | null>
  extended: boolean
  calibration: RemoteCalibration | null
  onComplete: (samples: CalibrationSample[], viewport: CaptureViewport) => void
  onCancel: () => void
}

export type CaptureProgress = {
  index: number
  count: number
  reason: string
  timedOut: boolean
  bursting: boolean
}
