import type { EyeModel } from "../eye-tracking/eye-tracking.types"
import type { TrackerController } from "../eye-tracking/use-tracker.types"

export type SceneStatus = {
  connected: boolean
  calibrated: boolean
  deviceId?: string
  recording?: boolean
}

export type SceneWorkspaceProps = {
  tracker: TrackerController
  step: number
  onStepChange: (step: number) => void
  onStatus: (status: SceneStatus) => void
  eyeRevision: number
}

export type SceneSetupCache = {
  revision: number
  model: EyeModel | null
  key: string | null
}
