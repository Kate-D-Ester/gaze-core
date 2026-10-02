import type { irEyeSearchBounds } from "./ir-face-features"

import type { RgbFaceResult } from "./rgb-features"

import type { Point } from "./remote-eye-tracking.types"

export interface IrFaceLocator {
  detect(frame: ImageBitmap, timestamp: number): RgbFaceResult
  dispose(): void
}

export type IrProcessorOptions = { faceLocator?: IrFaceLocator | null }

export type IrEyeFrame = {
  center: Point
  span: number
  angle: number
  aperture: Point[]
  search: ReturnType<typeof irEyeSearchBounds>
}
