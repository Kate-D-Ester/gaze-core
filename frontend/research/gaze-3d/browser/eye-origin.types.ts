import type {
  Point,
  Vector3,
} from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"

export type CalibratedIntrinsics = {
  fx: number
  fy: number
  cx: number
  cy: number
  imageWidth: number
  imageHeight: number
}

export type EyeOriginInput = {
  /** Rigid face reference points, already undistorted; moving pupils are unsuitable. */
  leftAnchorPixels: Point
  rightAnchorPixels: Point
  /** Right minus left anchor in CAMERA axes, with measured physical scale. */
  anchorSpanMetres: Vector3
  /** Camera-frame offset from rigid anchor midpoint to eyeball-center midpoint; caller must supply it. */
  eyeCenterFromAnchorMidpointMetres: Vector3
  intrinsics: CalibratedIntrinsics
}

export type EstimatedEyeOrigin = {
  originMetres: Vector3
  anchorResidualMetres: number
  source: "monocular-estimate"
}
