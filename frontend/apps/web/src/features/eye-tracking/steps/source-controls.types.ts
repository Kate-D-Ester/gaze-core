import type { TrackerController } from "../use-tracker.types"

export type SourceControlsProps = {
  excludedDeviceId?: string
  tracker: TrackerController
  deviceId: string
  setDeviceId: (id: string) => void
  resetSource: () => void
}
