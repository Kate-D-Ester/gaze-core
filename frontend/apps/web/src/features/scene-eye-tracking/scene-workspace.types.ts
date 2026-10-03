import type { SceneSession } from "./scene-session"
import type { SceneCamera } from "./scene-camera"
import type { TrackerController } from "../eye-tracking/use-tracker.types"

export type SceneStatus = {
  connected: boolean
  calibrated: boolean
  verified?: boolean
  reused?: boolean
  deviceId?: string
  recording?: boolean
  capturing?: boolean
  connecting?: boolean
}

export type SceneWorkspaceProps = {
  sceneCamera?: SceneCamera
  excludedDeviceIds?: readonly string[]
  tracker: TrackerController
  step: number
  onStepChange: (step: number) => void
  onSession?: (session: SceneSession) => void
  onStatus: (status: SceneStatus) => void
  eyeRevision: number
}
