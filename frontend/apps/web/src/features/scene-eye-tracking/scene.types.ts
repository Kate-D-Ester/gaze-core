import type { Point } from "../eye-tracking/eye-tracking.types"

export type Landmark = { x: number; y: number; z: number }
export type EyeObservation = {
  id: number
  timestamp: number
  feature: Point | null
  confidence: number
  valid: boolean
}
export type SceneObservation = {
  id: number
  timestamp: number
  width: number
  height: number
  generation: number
}
export type HandObservation = {
  scene: SceneObservation
  landmarks: Landmark[][]
  worldLandmarks: Landmark[][]
  handedness: string[]
}
export type CalibrationPair = {
  eyeId: number
  sceneId: number
  eyeTimestamp: number
  sceneTimestamp: number
  feature: Point
  target: Point
  handedness: string
  width: number
  height: number
}
export type CalibrationHold = {
  region: number
  feature: Point
  target: Point
  pairs: CalibrationPair[]
}
export type Collector = {
  mode: "calibration" | "validation"
  holds: CalibrationHold[]
  pending: CalibrationPair[]
  anchor: CalibrationPair | null
  lastEyeId: number
  lastSceneId: number
  lastTimestamp: number
}
export type CollectionResult = {
  complete: boolean
  progress: number
  hint: string
  holds: CalibrationHold[]
}
export type SceneCalibration = {
  model: "affine" | "quadratic"
  coefficients: [number[], number[]]
  mean: Point
  scale: Point
  crossValidationRms: number
  bounds: { min: Point; max: Point }
  holds: CalibrationHold[]
}
export type ValidationResult = {
  normalizedRms: number
  pixelRms: number
  passed: boolean
  holds: number
  pairs: number
}
export type GazeMeasurement = {
  timestamp: number
  eyeId: number | null
  sceneId: number | null
  eyeTimestamp: number | null
  sceneTimestamp: number | null
  confidence: number
  position: Point | null
  pixels: Point | null
  valid: boolean
  reason: string
  extrapolated: boolean
}
