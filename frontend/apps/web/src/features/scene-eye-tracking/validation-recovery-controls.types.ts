import type { SceneSession, SceneSessionSnapshot } from "./scene-session"

export type ValidationRecoveryControlsProps = {
  session: SceneSession
  state: SceneSessionSnapshot
  canCapture: boolean
  prepare?: () => void
}
