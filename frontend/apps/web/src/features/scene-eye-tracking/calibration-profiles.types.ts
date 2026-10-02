import type { Point, TrackerFormat } from "../eye-tracking/eye-tracking.types"
import type {
  CalibrationMethod,
  CameraOrientation,
  SceneCalibration,
} from "./scene.types"

export type SceneProfileSetup = {
  trackerFormat: TrackerFormat
  orientation: CameraOrientation
}

export type SceneProfileCalibration = {
  calibration: SceneCalibration
  method: CalibrationMethod
  offset: Point
  delayMs: number
}

export type SceneCalibrationProfile = SceneProfileCalibration & {
  id: string
  name: string
  updatedAt: string
  setup: SceneProfileSetup
}

export type SceneProfileLibrary = {
  version: 1
  selectedId: string | null
  profiles: SceneCalibrationProfile[]
}
