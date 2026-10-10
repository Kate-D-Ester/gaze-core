import type { RefObject } from "react"
import type { TargetCollectorOptions } from "./sample-collector.types"
import type { RemoteFixationGuide } from "./fixation-guide"
import type {
  CalibrationSample,
  RemoteCalibration,
  RemoteObservation,
} from "./remote-eye-tracking.types"

export type CaptureViewport = {
  width: number
  height: number
}

export type RemoteCalibrationOverlayProps = {
  latest: RefObject<RemoteObservation | null>
  repairTargets?: [number, number][]
  targets?: [number, number][]
  comfortableHold?: boolean
  trainingTargets?: [number, number][]
  captureViewport?: CaptureViewport
  onRestartCapture?: () => void
  collectionOptions?: TargetCollectorOptions
  fixationGuide?: RemoteFixationGuide
  autoStart?: boolean
  stageLabel?: string
  stageInstruction?: string
  welcomeInstruction?: string
  welcomeTitle?: string
  startButtonLabel?: string
  onStart?: () => void
  onTargetTimeout?: RemoteCalibrationOverlayProps["onComplete"]
  calibration: RemoteCalibration | null
  onComplete: (
    samples: CalibrationSample[],
    viewport: CaptureViewport,
    attempts?: CalibrationSample[]
  ) => void
  onCancel: () => void
}

export type CaptureProgress = {
  index: number
  count: number
  fraction?: number
  reason: string
  timedOut: boolean
  bursting: boolean
  viewportChanged: boolean
}

export type RemoteCaptureSession = {
  index: number
  samples: CalibrationSample[]
  attempts: CalibrationSample[]
  lastAttempt: number
  viewport: CaptureViewport | null
}
