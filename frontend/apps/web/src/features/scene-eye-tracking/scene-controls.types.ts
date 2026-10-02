import type { FrameDimensions } from "../eye-tracking/eye-tracking.types"
import type { CalibrationMethod } from "./scene.types"
import type { SceneSession, SceneSessionSnapshot } from "./scene-session"

export type SceneLiveControlsProps = {
  session: SceneSession
  state: SceneSessionSnapshot
  onCalibrate: () => void
  canValidate: boolean
  recording?: boolean
  onMethodChange?: (method: CalibrationMethod) => void
  sceneDimensions?: FrameDimensions
}
