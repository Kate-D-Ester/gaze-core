import { finite } from "./geometry"
import type { Calibration, CalibrationSample, Point, Vector3 } from "./types"

export const CALIBRATION_TARGETS: Point[] = [
  [0.5, 0.5],
  [0.1, 0.1],
  [0.5, 0.1],
  [0.9, 0.1],
  [0.9, 0.5],
  [0.9, 0.9],
  [0.5, 0.9],
  [0.1, 0.9],
  [0.1, 0.5],
]
export const VALIDATION_TARGETS: Point[] = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.7, 0.7],
  [0.3, 0.7],
  [0.5, 0.6],
]
export function gazeFeature(direction: Vector3): Point | null {
  return finite(direction) && direction[2] < -0.1
    ? [direction[0] / -direction[2], direction[1] / -direction[2]]
    : null
}
/** Centered/scaled affine least squares using modified Gram-Schmidt QR.
 * Three coefficients need fewer samples and extrapolate more safely than a high-order polynomial. */
function solve(samples: CalibrationSample[]): [number[], number[]] | null {
  if (
    samples.length < 4 ||
    samples.some((s) => !finite([...s.feature, ...s.target]))
  )
    return null
  const n = samples.length
  const mean: Point = [0, 1].map(
    (i) => samples.reduce((s, v) => s + v.feature[i], 0) / n
  ) as Point
  const scale: Point = [0, 1].map((i) =>
    Math.sqrt(
      samples.reduce((s, v) => s + (v.feature[i] - mean[i]) ** 2, 0) / n
    )
  ) as Point
  if (scale.some((v) => v < 0.002)) return null
  const cols = [
    samples.map(() => 1),
    samples.map((s) => (s.feature[0] - mean[0]) / scale[0]),
    samples.map((s) => (s.feature[1] - mean[1]) / scale[1]),
  ]
  const q: number[][] = [],
    r = Array.from({ length: 3 }, () => [0, 0, 0])
  for (let j = 0; j < 3; j++) {
    const v = cols[j].slice()
    for (let i = 0; i < j; i++) {
      r[i][j] = q[i].reduce((s, x, k) => s + x * v[k], 0)
      for (let k = 0; k < n; k++) v[k] -= r[i][j] * q[i][k]
    }
    r[j][j] = Math.hypot(...v)
    if (r[j][j] < 1e-3 * Math.sqrt(n)) return null
    q.push(v.map((x) => x / r[j][j]))
  }
  return [0, 1].map((axis) => {
    const v = q.map((col) =>
      col.reduce((sum, x, i) => sum + x * samples[i].target[axis], 0)
    )
    for (let i = 2; i >= 0; i--) {
      for (let j = i + 1; j < 3; j++) v[i] -= r[i][j] * v[j]
      v[i] /= r[i][i]
    }
    return [
      v[0] - (v[1] * mean[0]) / scale[0] - (v[2] * mean[1]) / scale[1],
      v[1] / scale[0],
      v[2] / scale[1],
    ]
  }) as [number[], number[]]
}
export function mapGaze(
  calibration: Calibration,
  feature: Point
): Point | null {
  if (!finite(feature)) return null
  const p = calibration.coefficients.map(
    (c) => c[0] + c[1] * feature[0] + c[2] * feature[1]
  ) as Point
  return finite(p) ? p : null
}
export function fitCalibration(
  samples: CalibrationSample[]
): Calibration | null {
  if (samples.length < 9) return null
  const coefficients = solve(samples)
  if (!coefficients) return null
  let squared = 0
  for (let i = 0; i < samples.length; i++) {
    const held = solve(samples.filter((_, j) => j !== i))
    if (!held) return null
    const predicted = mapGaze(
      { coefficients: held, validationError: 0 },
      samples[i].feature
    )!
    squared +=
      (predicted[0] - samples[i].target[0]) ** 2 +
      (predicted[1] - samples[i].target[1]) ** 2
  }
  const validationError = Math.sqrt(squared / samples.length)
  return Number.isFinite(validationError)
    ? { coefficients, validationError }
    : null
}
