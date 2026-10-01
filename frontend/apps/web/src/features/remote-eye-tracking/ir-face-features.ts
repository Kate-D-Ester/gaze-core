import type { Point, Rect } from "./types"
import type { RgbFaceGeometry } from "./rgb-features"

export const IR_EYE_CORNERS = [
  [33, 133],
  [362, 263],
] as const
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
    const a = points[0],
      b = points[1],
      span = Math.hypot(b[0] - a[0], b[1] - a[1])
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
  pupils: Point[]
): {
  feature: number[]
  pose: RgbFaceGeometry["pose"]
  basePoint: Point
} | null {
  if (pupils.length !== 2 || !pupils.flat().every(Number.isFinite)) return null
  const offsets = pupils.flatMap((p, i) => {
    const [a, b] = IR_EYE_CORNERS[i].map((index) => geometry.landmarks[index])
    const span = Math.hypot(b[0] - a[0], b[1] - a[1])
    const ux = (b[0] - a[0]) / span,
      uy = (b[1] - a[1]) / span
    const dx = p[0] - (a[0] + b[0]) / 2,
      dy = p[1] - (a[1] + b[1]) / 2
    return [(dx * ux + dy * uy) / span, (-dx * uy + dy * ux) / span]
  })
  const gx = (offsets[0] + offsets[2]) / 2,
    gy = (offsets[1] + offsets[3]) / 2
  const { yaw, pitch, roll, x, y, scale } = geometry.pose,
    depth = Math.log(scale)
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
  ]
  if (!feature.every(Number.isFinite)) return null
  return { feature, pose: geometry.pose, basePoint: [gx + 0.5, gy + 0.5] }
}
