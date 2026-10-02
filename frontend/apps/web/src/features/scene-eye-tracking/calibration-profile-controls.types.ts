import type { CalibrationProfilesController } from "./use-calibration-profiles.types"

export type CalibrationProfileControlsProps = {
  controller: CalibrationProfilesController
}

export type ProfileNameDraft = {
  name: string
  createNew: boolean
}
