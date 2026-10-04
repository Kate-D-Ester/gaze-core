import type {
  SceneCalibrationProfile,
  SceneProfileSetup,
} from "./calibration-profiles.types"
import type { SceneSession, SceneSessionSnapshot } from "./scene-session"

export type UseCalibrationProfilesOptions = {
  session: SceneSession
  state: SceneSessionSnapshot
  setup: SceneProfileSetup
  ready: boolean
  disabled: boolean
  onLoaded: () => void
}

export type CalibrationProfilesController = {
  profiles: SceneCalibrationProfile[]
  selectedId: string | null
  error: string
  message: string
  disabled: boolean
  canLoad: boolean
  canSave: boolean
  load: (id: string) => void
  save: (name: string, profileId?: string) => boolean
  remove: () => void
}
