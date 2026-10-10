import type { Point } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

export type IrisImageOptions = {
  center?: Point
  radii?: Point
  angle?: number
  contrast?: number
  noise?: number
  glint?: boolean
  lid?: number
}
