import type {
  Point,
  Vector3,
} from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"

export type Matrix3 = [Vector3, Vector3, Vector3]

/** All coordinates use OpenCV camera axes: X right, Y down, Z forward. */
export type MetricGazeRay = {
  originMetres: Vector3
  direction: Vector3
}

/** destination = rotation * source + translation; direction has no translation. */
export type RigidTransform = {
  rotation: Matrix3
  translationMetres: Vector3
}

export type MetricScreen = {
  centerMetres: Vector3
  /** Unit axes toward increasing physical screen coordinates. */
  right: Vector3
  down: Vector3
  widthMetres: number
  heightMetres: number
  pixelWidth: number
  pixelHeight: number
}

export type ScreenProjection =
  | {
      kind: "projected"
      normalized: Point
      pixels: Point
      intersectionMetres: Vector3
      distanceMetres: number
      outside: boolean
    }
  | {
      kind: "unavailable"
      reason:
        | "invalid-screen"
        | "invalid-ray"
        | "parallel-ray"
        | "backward-ray"
        | "invalid-viewport"
    }

/** Browser content bounds expressed in the same pixel coordinate system as MetricScreen. */
export type ScreenViewport = {
  leftPixels: number
  topPixels: number
  widthPixels: number
  heightPixels: number
}
