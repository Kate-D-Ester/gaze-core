export type Point = [number, number]
export type Vector3 = [number, number, number]
export type TrackerFormat = "classic" | "spatial"
export type Rect = { x: number; y: number; width: number; height: number }
export type FrameDimensions = { width: number; height: number }
/** Semiaxes in pixels; angle of the MAJOR axis, in radians, image y down. */
export type Ellipse = {
  center: Point
  major: number
  minor: number
  angle: number
  confidence: number
}
export type Intrinsics = { fx: number; fy: number; cx: number; cy: number }
export type Sphere = { center: Vector3; radius: number }
export type Gaze = { origin: Vector3; direction: Vector3; pupil: Vector3 }
export type EyeModel = {
  center: Point
  radius: number
  residual: number
  samples: number
  coverage: number
  ready: boolean
}
export type ThresholdPreview = {
  label: string
  threshold: number
  mask?: Uint8Array
  score: number
}
export type Detection = {
  /** Visible feedback only; never used to fit the eye model or produce gaze. */
  candidate?: Ellipse
  tracking?: "tracking" | "reacquiring" | "lost"
  ellipse: Ellipse | null
  seed: Point | null
  contour: Point[]
  refined: Point[]
  previews: ThresholdPreview[]
  selected: number
  reason: string
}
export type FrameSettings = {
  format: TrackerFormat
  roi: Rect
  threshold: number
  thresholdMode?: "auto" | "manual"
  fov: number
  radiusMm: number
  corners: [Point, Point] | null
  locked: boolean
}
export type TrackingFrame = {
  id: number
  timestamp: number
  width: number
  height: number
  roi: Rect
  detection: Detection
  model: EyeModel | null
  gaze: Gaze | null
  processingMs: number
}
export type CalibrationSample = { feature: Point; target: Point }
export type Calibration = {
  coefficients: [number[], number[]]
  validationError: number
}
