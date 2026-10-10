import { pointInPolygon } from "../eye-tracking/geometry"
import { buildFacePerspectiveFeatures } from "./face-perspective"
import type {
  IrEyeSearchBounds,
  IrFaceFeatureResult,
} from "./ir-face-features.types"
import type { Point, Rect } from "./remote-eye-tracking.types"
import type { RgbFaceGeometry } from "./rgb-features.types"
import { EYE_CANTHI, measureEyeMovement } from "./tracking-vectors"
import type { IrFeatureStrategy } from "./ir-face-features.types"
export const IR_EYE_CORNERS = EYE_CANTHI
const LIDS = [
  [158, 160, 144, 153],
  [385, 387, 373, 380],
]
/** Canthi and lids delimit the current opening; these are bounds, never a pupil estimate. */
export function irEyeAperture(geometry: RgbFaceGeometry, eye: number): Point[] {
  const [a, b] = IR_EYE_CORNERS[eye].map((index) => geometry.landmarks[index])
  const along = (point: Point) =>
    (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])
  const lids = LIDS[eye].map((index) => geometry.landmarks[index])
  return [
    a,
    ...lids.slice(0, 2).sort((p, q) => along(p) - along(q)),
    b,
    ...lids.slice(2).sort((p, q) => along(q) - along(p)),
  ]
}
/** Optional anatomical prior: iris landmarks constrain search, never replace a pixel measurement. */
export function irEyeSearchBounds(
  geometry: RgbFaceGeometry,
  eye: number
): IrEyeSearchBounds | null {
  const index = eye === 0 ? 468 : 473
  const center = geometry.landmarks[index]
  const ring = geometry.landmarks.slice(index + 1, index + 5)
  if (
    !center ||
    ring.length !== 4 ||
    ![center, ...ring].flat().every(Number.isFinite) ||
    !pointInPolygon(center, irEyeAperture(geometry, eye))
  ) {
    return null
  }
  const [a, b] = IR_EYE_CORNERS[eye].map((i) => geometry.landmarks[i])
  const span = Math.hypot(b[0] - a[0], b[1] - a[1])
  const radius =
    ring.reduce(
      (sum, p) => sum + Math.hypot(p[0] - center[0], p[1] - center[1]),
      0
    ) / 4
  if (radius < 3 || radius < span * 0.05 || radius > span * 0.25) {
    return null
  }
  for (const [first, second] of [
    [0, 2],
    [1, 3],
  ]) {
    const a = ring[first]
    const b = ring[second]
    const midpointError = Math.hypot(
      (a[0] + b[0]) / 2 - center[0],
      (a[1] + b[1]) / 2 - center[1]
    )
    if (
      midpointError > radius * 0.4 ||
      Math.hypot(a[0] - b[0], a[1] - b[1]) < radius
    ) {
      return null
    }
  }
  const u: Point = [ring[0][0] - ring[2][0], ring[0][1] - ring[2][1]]
  const v: Point = [ring[1][0] - ring[3][0], ring[1][1] - ring[3][1]]
  if (
    Math.abs(u[0] * v[1] - u[1] * v[0]) /
      (Math.hypot(...u) * Math.hypot(...v)) <
    0.2
  ) {
    return null
  }
  return {
    center,
    centerRadius: Math.max(6, radius * 1.1),
    maxRadius: Math.min(span * 0.22, radius * 1.25),
  }
}
/** Eye proposals only: pupil centers are measured from camera pixels, never copied from iris landmarks. */
export function irEyeRegions(
  geometry: RgbFaceGeometry,
  width: number,
  height: number
): Rect[] {
  return IR_EYE_CORNERS.map((corners, i) => {
    const points = [...corners, ...LIDS[i]].map(
      (index) => geometry.landmarks[index]
    )
    const a = points[0]
    const b = points[1]
    const span = Math.hypot(b[0] - a[0], b[1] - a[1])
    const padding = span * 0.16
    const x = Math.max(
      0,
      Math.floor(Math.min(...points.map((p) => p[0])) - padding)
    )
    const y = Math.max(
      0,
      Math.floor(Math.min(...points.map((p) => p[1])) - padding)
    )
    const right = Math.min(
      width,
      Math.ceil(Math.max(...points.map((p) => p[0])) + padding)
    )
    const bottom = Math.min(
      height,
      Math.ceil(Math.max(...points.map((p) => p[1])) + padding)
    )
    return { x, y, width: right - x, height: bottom - y }
  })
}
/** Stable, binocular pupil/canthus inputs plus independently observed head pose. Glints are optional. */
export function buildIrFaceFeatures(
  geometry: RgbFaceGeometry,
  pupils: Point[],
  strategy: IrFeatureStrategy = "legacy"
): IrFaceFeatureResult | null {
  if (pupils.length !== 2 || !pupils.flat().every(Number.isFinite)) {
    return null
  }
  const movements = pupils.map((pupil, index) => {
    return measureEyeMovement(geometry.landmarks, index, pupil, "ir-pupil")
  })
  const right = movements[0]
  const left = movements[1]
  if (!right || !left) {
    return null
  }
  const offsets = [...right.local, ...left.local]
  if (strategy === "camera-axes-v2") {
    const roll = geometry.pose.roll
    if (roll === null) {
      return null
    }
    const { yaw, pitch, x, y, scale } = geometry.pose
    if (yaw === null || pitch === null || scale <= 0) {
      return null
    }
    const feature = [
      ...offsets,
      ...right.camera,
      ...left.camera,
      yaw,
      pitch,
      roll,
      x - 0.5,
      y - 0.5,
      Math.log(scale),
    ]
    if (!feature.every(Number.isFinite)) {
      return null
    }
    return {
      feature,
      cameraOcularOffsets: [...right.camera, ...left.camera],
      featureVersion: "ir-camera-axes-v2",
      pose: geometry.pose,
      basePoint: [
        (right.camera[0] + left.camera[0]) / 2 + 0.5,
        (right.camera[1] + left.camera[1]) / 2 + 0.5,
      ],
    }
  }
  const gx = (offsets[0] + offsets[2]) / 2
  const gy = (offsets[1] + offsets[3]) / 2
  const perspective = buildFacePerspectiveFeatures({
    pose: geometry.pose,
    offsets,
  })
  if (!perspective) {
    return null
  }
  const { yaw, pitch, roll, x, y, scale } = geometry.pose
  const depth = Math.log(scale)
  const feature = [
    ...offsets,
    yaw,
    pitch,
    roll,
    x - 0.5,
    y - 0.5,
    depth,
    gx * gx,
    gx * gy,
    gy * gy,
    gx * yaw,
    gy * pitch,
    gx * (x - 0.5),
    gy * (y - 0.5),
    gx * depth,
    gy * depth,
    yaw * pitch,
    ...perspective,
  ]
  if (!feature.every(Number.isFinite)) {
    return null
  }
  return {
    feature,
    pose: geometry.pose,
    basePoint: [gx + 0.5, gy + 0.5],
    cameraOcularOffsets: [...right.camera, ...left.camera],
  }
}
