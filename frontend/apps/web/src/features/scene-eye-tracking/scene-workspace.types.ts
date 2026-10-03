import type { TrackerController } from "../eye-tracking/use-tracker.types"

export type SceneStatus = {
  connected: boolean
  calibrated: boolean
  deviceId?: string
  recording?: boolean
  accuracyChecked?: boolean
}

export type SceneWorkspaceProps = {
  tracker: TrackerController
  step: number
  onStepChange: (step: number) => void
  onStatus: (status: SceneStatus) => void
  eyeRevision: number
  speakerMode?: boolean
  enabled?: boolean
}
