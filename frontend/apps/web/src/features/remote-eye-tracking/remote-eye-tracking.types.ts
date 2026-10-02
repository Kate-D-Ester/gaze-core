export type RemoteMode = "mobile" | "webcam" | "ir"
export type Point = [number, number]
export type Rect = { x: number; y: number; width: number; height: number }

/** Position and apparent scale are normalized image values, not metric camera coordinates. */
export type HeadPose = {
  kind: "face" | "eye-reference"
  yaw: number | null
  pitch: number | null
  roll: number | null
  x: number
  y: number
  scale: number
}
export type RemoteObservation = {
  /** Recorded frames are for inspection and have no synchronized screen labels. */
  source?: "camera" | "video"
  timestamp: number
  width: number
  height: number
  feature: number[] | null
  quality: number
  reason: string | null
  eyes: { center: Point; radius: number }[]
  /** Measured IR eye crops and reflections for setup feedback. */
  eyeRegions?: Rect[]
  glints?: Point[]
  faceBox: Rect | null
  pose: HeadPose | null
  basePoint: Point | null
  method: string
  processingMs: number
}
export type RemoteSettings = { roi: Rect; threshold: number }
export interface RemoteProcessor {
  process(
    frame: ImageBitmap,
    timestamp: number,
    settings: RemoteSettings
  ): Promise<RemoteObservation>
  dispose(): void
}
export type RemoteRequest =
  | { type: "init"; mode: RemoteMode }
  | {
      type: "frame"
      frame: ImageBitmap
      timestamp: number
      /** Recording time in milliseconds, independent of playback speed and wall time. */
      mediaTimestamp?: number
      settings: RemoteSettings
    }
export type RemoteResponse =
  | { type: "ready"; method: string }
  | { type: "result"; observation: RemoteObservation }
  | { type: "error"; message: string; fatal: boolean }
export type CalibrationSample = {
  observation: RemoteObservation
  target: Point
  targetId: number
}
export type RemoteCalibration = {
  mode: RemoteMode
  featureMean: number[]
  featureScale: number[]
  coefficients: [number[], number[]]
  regularization: number
  crossValidationError: number
  poseKind: HeadPose["kind"]
  poseSamples: number[][]
  poseBounds: { min: number[]; max: number[] }
  targetCount: number
  sampleCount: number
}
export type ValidationResult = {
  meanPixels: number
  rmsPixels: number
  p95Pixels: number
  jitterPixels: number
  targetCount: number
  sampleCount: number
}
