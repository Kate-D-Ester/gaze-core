import type { SceneSession, SceneSessionSnapshot } from "./scene-session"
import type {
  SceneCalibrationProfile,
  SceneProfileSetup,
} from "./calibration-profiles.types"

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
  save: (name: string, createNew: boolean) => boolean
  remove: () => void
}
