import { describe, expect, test } from "bun:test"
import {
  cameraIntrinsics,
  normalize,
  raySphereIntersection,
  gazeFromPupil,
  sphereFromProjection,
  minorAxisLine,
  outerEdgeDistance,
  fitEyeCenter,
} from "../../apps/web/src/features/eye-tracking/geometry"
import {
  fitCalibration,
  mapGaze,
  gazeFeature,
} from "../../apps/web/src/features/eye-tracking/calibration"
import type {
  Ellipse,
  Point,
  Vector3,
} from "../../apps/web/src/features/eye-tracking/types"

const ellipse = (center: Point, angle: number): Ellipse => ({
  center,
  major: 24,
  minor: 15,
  angle,
  confidence: 0.99,
})
const closeVector = (a: number[] | null, b: number[]) => {
  expect(a).not.toBeNull()
  b.forEach((v, i) => expect(a![i]).toBeCloseTo(v, 7))
}

describe("ray geometry", () => {
  test("nearest forward hit, non-unit direction, inside, tangent and behind", () => {
    closeVector(
      raySphereIntersection([0, 0, 0], [0, 0, 2], [0, 0, 5], 1),
      [0, 0, 4]
    )
    closeVector(
      raySphereIntersection([0, 0, 5], [1, 0, 0], [0, 0, 5], 1),
      [1, 0, 5]
    )
    closeVector(
      raySphereIntersection([1, 0, 0], [0, 0, 1], [0, 0, 5], 1),
      [1, 0, 5]
    )
    expect(
      raySphereIntersection([0, 0, 0], [0, 0, -1], [0, 0, 5], 1)
    ).toBeNull()
    expect(raySphereIntersection([3, 0, 0], [0, 0, 1], [0, 0, 5], 1)).toBeNull()
  })
  test("invalid inputs cannot produce NaN gaze", () => {
    expect(normalize([0, 0, 0])).toBeNull()
    expect(raySphereIntersection([0, 0, 0], [0, 0, 0], [0, 0, 5], 1)).toBeNull()
    expect(
      raySphereIntersection([0, 0, 0], [0, 0, 1], [0, 0, NaN], 1)
    ).toBeNull()
    expect(cameraIntrinsics(640, 480, 0)).toBeNull()
    expect(
      sphereFromProjection([320, 240], 0, 12, cameraIntrinsics(640, 480, 45)!)
    ).toBeNull()
  })
  test("projected radius recovers a centered physical sphere", () => {
    const k = cameraIntrinsics(640, 480, 45)!
    const radiusPx = (k.fx * 12) / Math.sqrt(60 * 60 - 12 * 12)
    const sphere = sphereFromProjection([320, 240], radiusPx, 12, k)!
    closeVector(sphere.center, [0, 0, 60])
    closeVector(
      gazeFromPupil([320, 240], sphere, k)?.direction ?? null,
      [0, 0, -1]
    )
  })
  test("known sphere surface point recovers its direction under perspective", () => {
    const k = cameraIntrinsics(960, 540, 60)!
    const sphere = { center: [8, -3, 70] as Vector3, radius: 12 }
    const direction: Vector3 = [0.3, 0.4, -Math.sqrt(0.75)]
    const p = sphere.center.map((v, i) => v + direction[i] * 12)
    const pixel: Point = [
      (k.fx * p[0]) / p[2] + k.cx,
      (k.fy * p[1]) / p[2] + k.cy,
    ]
    closeVector(gazeFromPupil(pixel, sphere, k)?.direction ?? null, direction)
    expect(gazeFromPupil([1e5, 1e5], sphere, k)).toBeNull()
  })
})

describe("ellipse model", () => {
  test("major-axis angle is explicitly rotated to the minor-axis line", () => {
    closeVector(
      minorAxisLine(ellipse([10, 20], Math.PI / 2))?.direction ?? null,
      [-1, 0]
    )
    expect(minorAxisLine({ ...ellipse([0, 0], 0), minor: 23.9 })).toBeNull()
  })
  test("radial outer edge uses the rotated ellipse equation", () => {
    expect(outerEdgeDistance([0, 0], ellipse([30, 0], 0))).toBeCloseTo(54, 8)
    expect(
      outerEdgeDistance([0, 0], ellipse([30, 0], Math.PI / 2))
    ).toBeCloseTo(45, 8)
  })
  test("center consensus resists outliers and rejects parallel observations", () => {
    const observations = Array.from({ length: 30 }, (_, i) => {
      const t = (i * 2 * Math.PI) / 30
      return ellipse(
        [120 + 30 * Math.cos(t), 90 + 30 * Math.sin(t)],
        t + Math.PI / 2
      )
    })
    observations.push(ellipse([250, 20], 0.3), ellipse([12, 230], 2.2))
    const result = fitEyeCenter(observations, 320, 240)!
    closeVector(result.center, [120, 90])
    expect(result.inliers).toHaveLength(30)
    expect(result.residual).toBeLessThan(1e-7)
    expect(
      fitEyeCenter(
        Array.from({ length: 30 }, (_, i) => ellipse([i, 20], 0)),
        320,
        240
      )
    ).toBeNull()
  })
})

describe("screen calibration", () => {
  test("recovers an affine screen mapping and reports held-out error", () => {
    const samples = [0.1, 0.5, 0.9].flatMap((y) =>
      [0.1, 0.5, 0.9].map((x) => ({
        feature: [(x - 0.5) / 2, (y - 0.5) / 3] as Point,
        target: [x, y] as Point,
      }))
    )
    const fit = fitCalibration(samples)!
    expect(fit.validationError).toBeLessThan(1e-8)
    closeVector(mapGaze(fit, [0.1, -0.1]), [0.7, 0.2])
    closeVector(mapGaze(fit, [0.6, 0]), [1.7, 0.5]) // no clamping off-screen gaze
  })
  test("rejects collapsed samples, nonfinite values and grazing rays", () => {
    expect(
      fitCalibration(
        Array.from({ length: 9 }, () => ({
          feature: [0, 0] as Point,
          target: [0.5, 0.5] as Point,
        }))
      )
    ).toBeNull()
    expect(gazeFeature([1, 0, 0])).toBeNull()
    expect(gazeFeature([NaN, 0, -1])).toBeNull()
    closeVector(gazeFeature([0.3, 0.4, -0.5]), [0.6, 0.8])
  })
})
