import type { IrEyeTrack } from "./ir-eye-tracker"

import type { Point } from "./remote-eye-tracking.types"

export type IrEyeCoordinates = { origin: Point; scale: number; angle: number }

export type IrEyeBackgroundCandidate = {
  backgroundFraction: number
  track: IrEyeTrack
}
