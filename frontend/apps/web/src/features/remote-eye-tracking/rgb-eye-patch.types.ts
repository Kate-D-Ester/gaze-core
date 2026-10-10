import type { Rect } from "./remote-eye-tracking.types"

export type RgbEyePatchPlan = {
  frameWidth: number
  frameHeight: number
  backward: number[][]
  startY: number
  bandHeight: number
  sourceRect: Rect | null
}
