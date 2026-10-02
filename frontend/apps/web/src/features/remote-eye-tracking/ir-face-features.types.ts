import type { Point } from "./remote-eye-tracking.types"

import type { RgbFaceGeometry } from "./rgb-features"

export type IrEyeSearchBounds = {
  center: Point
  centerRadius: number
  maxRadius: number
}

export type IrFaceFeatureResult = {
  feature: number[]
  pose: RgbFaceGeometry["pose"]
  basePoint: Point
}
