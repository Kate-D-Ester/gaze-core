import type { Point } from "./remote-eye-tracking.types"
import type { RgbPixels } from "./rgb-features.types"
import { pointInPolygon } from "../eye-tracking/geometry"
import type {
  IrisBoundaryCircle,
  IrisBoundaryFit,
  IrisBoundaryPoint,
  IrisBoundaryProposal,
} from "./rgb-iris-refinement.types"

const RAYS = 40
const RADIAL_STEPS = 20
const MIN_CONTRAST = 14
const MAX_CENTER_SHIFT = 0.35

function luminance(pixels: RgbPixels, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= pixels.width - 1 || y >= pixels.height - 1) {
    return null
  }
  const left = Math.floor(x)
  const top = Math.floor(y)
  const fx = x - left
  const fy = y - top
  let value = 0
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 2; column++) {
      const index = ((top + row) * pixels.width + left + column) * 4
      const weightX = column === 0 ? 1 - fx : fx
      const weightY = row === 0 ? 1 - fy : fy
      const gray =
        pixels.data[index] * 0.2126 +
        pixels.data[index + 1] * 0.7152 +
        pixels.data[index + 2] * 0.0722
      value += gray * weightX * weightY
    }
  }
  return value
}

/** Circle fitting in ellipse-normalized coordinates keeps foreshortening, rather than imposing a round iris. */
function fitCircle(points: IrisBoundaryPoint[]): IrisBoundaryCircle | null {
  const count = points.length
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / count
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / count
  let xx = 0
  let xy = 0
  let yy = 0
  let xRadius = 0
  let yRadius = 0
  for (const point of points) {
    const x = point.x - meanX
    const y = point.y - meanY
    const radius = x * x + y * y
    xx += x * x
    xy += x * y
    yy += y * y
    xRadius += x * radius
    yRadius += y * radius
  }
  const determinant = xx * yy - xy * xy
  if (determinant < 1e-5) {
    return null
  }
  const cx = (xRadius * yy - yRadius * xy) / (2 * determinant)
  const cy = (yRadius * xx - xRadius * xy) / (2 * determinant)
  const x = meanX + cx
  const y = meanY + cy
  const radius = Math.sqrt(cx * cx + cy * cy + (xx + yy) / count)
  if (Math.hypot(x, y) > MAX_CENTER_SHIFT || radius < 0.75 || radius > 1.25) {
    return null
  }
  return { x, y, radius }
}

function residual(
  point: IrisBoundaryPoint,
  circle: IrisBoundaryCircle
): number {
  return Math.abs(
    Math.hypot(point.x - circle.x, point.y - circle.y) - circle.radius
  )
}

function boundaryConsensus(
  points: IrisBoundaryPoint[]
): IrisBoundaryFit | null {
  if (points.length < 14) {
    return null
  }
  let best: IrisBoundaryPoint[] = []
  let bestError = Infinity
  let random = 7141
  const nextIndex = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0
    return random % points.length
  }
  // Fixed work budget: no frame-to-frame state or unbounded random search.
  for (let attempt = 0; attempt < 80; attempt++) {
    const candidate = fitCircle([
      points[nextIndex()]!,
      points[nextIndex()]!,
      points[nextIndex()]!,
    ])
    if (!candidate) {
      continue
    }
    const inliers = points.filter((point) => residual(point, candidate) < 0.1)
    const error = inliers.reduce(
      (sum, point) => sum + residual(point, candidate),
      0
    )
    if (
      inliers.length > best.length ||
      (inliers.length === best.length && error < bestError)
    ) {
      best = inliers
      bestError = error
    }
  }
  if (best.length < 14 || best.length < points.length * 0.75) {
    return null
  }
  const circle = fitCircle(best)
  if (!circle) {
    return null
  }
  const spreadX =
    Math.max(...best.map((p) => p.x)) - Math.min(...best.map((p) => p.x))
  const spreadY =
    Math.max(...best.map((p) => p.y)) - Math.min(...best.map((p) => p.y))
  // A narrow arc cannot constrain both center coordinates reliably.
  if (spreadX < 1.2 || spreadY < 0.85) {
    return null
  }
  const error =
    best.reduce((sum, point) => sum + residual(point, circle), 0) / best.length
  const contrast =
    best.reduce((sum, point) => sum + point.contrast, 0) / best.length
  const coverage = Math.min(1, best.length / 24)
  const precision = Math.max(0, 1 - error / 0.1)
  const confidence = coverage * precision * Math.min(1, contrast / 50)
  if (confidence < 0.45) {
    return null
  }
  return { center: [circle.x, circle.y], confidence }
}

/** Seeded limbus refinement on existing RGB readback; uncertainty preserves the original measurement. */
export function refineIrisBoundary(
  pixels: RgbPixels,
  origin: Point,
  proposal: IrisBoundaryProposal
): IrisBoundaryFit | null {
  const { center, radii, angle, eyelid } = proposal
  if (
    ![...center, ...radii, angle, ...origin, ...eyelid.flat()].every(
      Number.isFinite
    ) ||
    radii.some((radius) => radius < 4 || radius > 64) ||
    radii[0] / radii[1] < 0.5 ||
    radii[0] / radii[1] > 2 ||
    eyelid.length < 4 ||
    pixels.width < 2 ||
    pixels.height < 2 ||
    pixels.data.length !== pixels.width * pixels.height * 4
  ) {
    return null
  }
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const points: IrisBoundaryPoint[] = []
  for (let ray = 0; ray < RAYS; ray++) {
    const theta = (ray * 2 * Math.PI) / RAYS
    const u = Math.cos(theta)
    const v = Math.sin(theta)
    const dx = u * radii[0] * cosine - v * radii[1] * sine
    const dy = u * radii[0] * sine + v * radii[1] * cosine
    const probe = 1 / Math.hypot(dx, dy)
    const contrasts: number[] = []
    let bestStep = -1
    let bestContrast = MIN_CONTRAST
    for (let step = 0; step <= RADIAL_STEPS; step++) {
      const radius = 0.6 + step * 0.04
      const inside: Point = [
        center[0] + dx * (radius - probe),
        center[1] + dy * (radius - probe),
      ]
      const outside: Point = [
        center[0] + dx * (radius + probe),
        center[1] + dy * (radius + probe),
      ]
      let contrast = 0
      if (pointInPolygon(inside, eyelid) && pointInPolygon(outside, eyelid)) {
        const dark = luminance(
          pixels,
          inside[0] - origin[0],
          inside[1] - origin[1]
        )
        const light = luminance(
          pixels,
          outside[0] - origin[0],
          outside[1] - origin[1]
        )
        if (dark !== null && light !== null && light < 248) {
          contrast = light - dark
        }
      }
      contrasts.push(contrast)
      if (contrast > bestContrast) {
        bestStep = step
        bestContrast = contrast
      }
    }
    if (bestStep <= 0 || bestStep >= RADIAL_STEPS) {
      continue
    }
    const before = contrasts[bestStep - 1]!
    const after = contrasts[bestStep + 1]!
    const curvature = before - 2 * bestContrast + after
    let adjustment = 0
    if (curvature < -0.001) {
      adjustment = Math.max(
        -0.5,
        Math.min(0.5, (0.5 * (before - after)) / curvature)
      )
    }
    const radius = 0.6 + (bestStep + adjustment) * 0.04
    points.push({ x: u * radius, y: v * radius, contrast: bestContrast })
  }
  const fit = boundaryConsensus(points)
  if (!fit) {
    return null
  }
  const [x, y] = fit.center
  return {
    center: [
      center[0] + x * radii[0] * cosine - y * radii[1] * sine,
      center[1] + x * radii[0] * sine + y * radii[1] * cosine,
    ],
    confidence: fit.confidence,
  }
}
