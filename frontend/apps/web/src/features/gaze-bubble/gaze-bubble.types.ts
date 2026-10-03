import type { Point } from "../eye-tracking/eye-tracking.types"

export type GazeBubbleSample = { point: Point; timestamp: number }
export type GazeBubbleOptions = {
  width: number
  height: number
  /** Existing validation metric in CSS pixels, not a probability bound. */
  errorRadiusPx: number | null
  verified: boolean
  /** False for scene-camera images: a fixed pixel is not a fixed world object. */
  stabilize: boolean
  maxAgeMs?: number
}
export type GazeBubbleState = {
  center: Point
  rawPoint: Point
  radiusPx: number
  errorRadiusPx: number | null
  limited: boolean
  verified: boolean
  motion: "stable" | "moving"
}
export type GazeImageSize = { width: number; height: number }
export type GazeView = GazeImageSize & {
  left: number
  top: number
  scale: number
}
export type PixelSample = { point: Point; timestamp: number }
