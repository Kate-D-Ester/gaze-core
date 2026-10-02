import type { TrackerController } from "../eye-tracking/use-tracker.types"

import type { SceneCamera } from "./scene-camera"

import type { SceneSessionSnapshot } from "./scene-session"

import type { HandObservation } from "./scene.types"

export type RecordingControlsProps = {
  camera: SceneCamera
  tracker: TrackerController
  state: SceneSessionSnapshot
  hand: HandObservation | null
  identity: string
  onRecordingChange?: (recording: boolean) => void
}
