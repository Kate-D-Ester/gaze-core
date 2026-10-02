import type { SceneCamera } from "./scene-camera"

import type { Point } from "../eye-tracking/eye-tracking.types"

import type { NetworkConnectionState } from "../eye-tracking/network-camera"

import type {
  CalibrationHold,
  CalibrationMethod,
  GazeMeasurement,
  HandObservation,
  SceneObservation,
} from "./scene.types"

import type { MarkerObservation } from "./marker-detector"

export type ScenePreviewProps = {
  camera: SceneCamera
  frame: SceneObservation | null
  hand: HandObservation | null
  handRecovering?: boolean
  marker?: MarkerObservation | null
  hideMarkerPattern?: boolean
  method?: CalibrationMethod
  gaze: GazeMeasurement | null
  trace: GazeMeasurement[]
  holds: CalibrationHold[]
  capturing: boolean
  target: Point | null
  progress: number
  connection: NetworkConnectionState
}
