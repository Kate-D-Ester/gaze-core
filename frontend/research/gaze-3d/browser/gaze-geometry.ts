import {
  dot,
  normalize,
} from "../../../apps/web/src/features/eye-tracking/geometry"
import type { Vector3 } from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type {
  Matrix3,
  MetricGazeRay,
  MetricScreen,
  RigidTransform,
  ScreenProjection,
  ScreenViewport,
} from "./gaze-geometry.types"

const AXIS_TOLERANCE = 1e-6
const MIN_RAY_PLANE_COSINE = 1e-6

export function isFiniteVector3(vector: Vector3): boolean {
  return (
    Array.isArray(vector) &&
    vector.length === 3 &&
    vector.every(Number.isFinite)
  )
}

export function crossProduct(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]
}

function isUnitVector(vector: Vector3): boolean {
  return (
    isFiniteVector3(vector) &&
    Math.abs(dot(vector, vector) - 1) <= AXIS_TOLERANCE
  )
}

export function isRigidTransform(
  transform: RigidTransform | null | undefined
): boolean {
  if (!transform || typeof transform !== "object") {
    return false
  }
  const { rotation, translationMetres } = transform
  if (
    !isFiniteVector3(translationMetres) ||
    !Array.isArray(rotation) ||
    rotation.length !== 3 ||
    !rotation.every(isUnitVector)
  ) {
    return false
  }
  const [first, second, third] = rotation
  return (
    Math.abs(dot(first, second)) <= AXIS_TOLERANCE &&
    Math.abs(dot(first, third)) <= AXIS_TOLERANCE &&
    Math.abs(dot(second, third)) <= AXIS_TOLERANCE &&
    Math.abs(dot(crossProduct(first, second), third) - 1) <= AXIS_TOLERANCE
  )
}

export function rotateVector(vector: Vector3, rotation: Matrix3): Vector3 {
  return [
    dot(rotation[0], vector),
    dot(rotation[1], vector),
    dot(rotation[2], vector),
  ]
}

/** Transform order is explicit at the call site; physical translation never changes direction. */
export function transformGazeRay(
  ray: MetricGazeRay,
  destinationFromSource: RigidTransform
): MetricGazeRay | null {
  if (
    !isFiniteVector3(ray.originMetres) ||
    !isFiniteVector3(ray.direction) ||
    !normalize(ray.direction) ||
    !isRigidTransform(destinationFromSource)
  ) {
    return null
  }
  const rotatedOrigin = rotateVector(
    ray.originMetres,
    destinationFromSource.rotation
  )
  return {
    originMetres: [
      rotatedOrigin[0] + destinationFromSource.translationMetres[0],
      rotatedOrigin[1] + destinationFromSource.translationMetres[1],
      rotatedOrigin[2] + destinationFromSource.translationMetres[2],
    ],
    direction: rotateVector(ray.direction, destinationFromSource.rotation),
  }
}

function isMetricScreen(screen: MetricScreen): boolean {
  if (
    !isFiniteVector3(screen.centerMetres) ||
    !isUnitVector(screen.right) ||
    !isUnitVector(screen.down) ||
    Math.abs(dot(screen.right, screen.down)) > AXIS_TOLERANCE
  ) {
    return false
  }
  return [
    screen.widthMetres,
    screen.heightMetres,
    screen.pixelWidth,
    screen.pixelHeight,
  ].every((value) => Number.isFinite(value) && value > 0)
}

/** The same unclamped projection is used for calibration labels and live predictions. */
export function projectGazeToScreen(
  ray: MetricGazeRay,
  screen: MetricScreen
): ScreenProjection {
  if (!isMetricScreen(screen)) {
    return { kind: "unavailable", reason: "invalid-screen" }
  }
  if (!isFiniteVector3(ray.originMetres) || !isFiniteVector3(ray.direction)) {
    return { kind: "unavailable", reason: "invalid-ray" }
  }
  const direction = normalize(ray.direction)
  if (!direction) {
    return { kind: "unavailable", reason: "invalid-ray" }
  }
  const normal = crossProduct(screen.right, screen.down)
  const denominator = dot(direction, normal)
  if (Math.abs(denominator) < MIN_RAY_PLANE_COSINE) {
    return { kind: "unavailable", reason: "parallel-ray" }
  }
  const toScreen: Vector3 = [
    screen.centerMetres[0] - ray.originMetres[0],
    screen.centerMetres[1] - ray.originMetres[1],
    screen.centerMetres[2] - ray.originMetres[2],
  ]
  const distanceMetres = dot(toScreen, normal) / denominator
  if (!Number.isFinite(distanceMetres) || distanceMetres <= 0) {
    return { kind: "unavailable", reason: "backward-ray" }
  }
  const intersectionMetres: Vector3 = [
    ray.originMetres[0] + distanceMetres * direction[0],
    ray.originMetres[1] + distanceMetres * direction[1],
    ray.originMetres[2] + distanceMetres * direction[2],
  ]
  const fromCenter: Vector3 = [
    intersectionMetres[0] - screen.centerMetres[0],
    intersectionMetres[1] - screen.centerMetres[1],
    intersectionMetres[2] - screen.centerMetres[2],
  ]
  const u = 0.5 + dot(fromCenter, screen.right) / screen.widthMetres
  const v = 0.5 + dot(fromCenter, screen.down) / screen.heightMetres
  if (![u, v, ...intersectionMetres].every(Number.isFinite)) {
    return { kind: "unavailable", reason: "invalid-ray" }
  }
  return {
    kind: "projected",
    normalized: [u, v],
    pixels: [u * screen.pixelWidth, v * screen.pixelHeight],
    intersectionMetres,
    distanceMetres,
    outside: u < 0 || u > 1 || v < 0 || v > 1,
  }
}

/** Physical display coordinates and browser content coordinates are separate registrations. */
export function projectGazeToViewport(
  ray: MetricGazeRay,
  screen: MetricScreen,
  viewport: ScreenViewport
): ScreenProjection {
  const dimensionsAreFinite = [
    viewport.leftPixels,
    viewport.topPixels,
    viewport.widthPixels,
    viewport.heightPixels,
  ].every(Number.isFinite)
  const liesWithinDisplay =
    viewport.leftPixels >= 0 &&
    viewport.topPixels >= 0 &&
    viewport.widthPixels > 0 &&
    viewport.heightPixels > 0 &&
    viewport.leftPixels + viewport.widthPixels <= screen.pixelWidth &&
    viewport.topPixels + viewport.heightPixels <= screen.pixelHeight
  if (!dimensionsAreFinite || !liesWithinDisplay) {
    return { kind: "unavailable", reason: "invalid-viewport" }
  }
  const projected = projectGazeToScreen(ray, screen)
  if (projected.kind !== "projected") {
    return projected
  }
  const x = projected.pixels[0] - viewport.leftPixels
  const y = projected.pixels[1] - viewport.topPixels
  const u = x / viewport.widthPixels
  const v = y / viewport.heightPixels
  return {
    ...projected,
    normalized: [u, v],
    pixels: [x, y],
    outside: u < 0 || u > 1 || v < 0 || v > 1,
  }
}
