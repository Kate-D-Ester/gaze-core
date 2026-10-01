import { detectSpatialPupil } from "../eye-tracking/detection"
import type { CV } from "../eye-tracking/opencv.types"
import type { PupilTracker } from "../eye-tracking/pupil-tracker"
import type { Detection, Ellipse } from "../eye-tracking/eye-tracking.types"
import type { HeadPose, Point } from "./types"

export type IrEyeOptions = {
  polarity?: "auto" | "dark" | "bright"
  /** Maximum pupil major semiaxis, in crop pixels. */
  maxRadius?: number
  /** Restrict pupil centers to a maxRadius neighborhood (or one quarter crop diagonal). */
  expectedCenter?: Point
  /** Separate center travel from the maximum pupil size. */
  centerRadius?: number
}

export type IrTrackingState = {
  pupils: PupilTracker
  polarity?: "dark" | "bright"
}

export type IrReference = {
  pupil: Ellipse
  glint: Point
  timestamp: number
  polarity?: "dark" | "bright"
}
export type IrEyeDetection = {
  pupil: Ellipse | null
  glint: Point | null
  quality: number
  reason: string | null
  reference: IrReference | null
}
type Glint = { center: Point; quality: number }
type IrPupilCandidate = {
  pupil: Ellipse
  intensity: number
  bright: boolean
  detection: Detection
}
const referenceLifetimeMs = 250

function compactGlints(
  gray: Uint8Array,
  width: number,
  height: number,
  pupil: Ellipse,
  pupilIntensity: number,
  minimumContrast: number
): Glint[] {
  const margin = Math.ceil(pupil.major * 1.8)
  const left = Math.max(0, Math.floor(pupil.center[0] - margin))
  const top = Math.max(0, Math.floor(pupil.center[1] - margin))
  const right = Math.min(width - 1, Math.ceil(pupil.center[0] + margin))
  const bottom = Math.min(height - 1, Math.ceil(pupil.center[1] + margin))
  let peak = 0
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++)
      peak = Math.max(peak, gray[y * width + x])
  if (peak - pupilIntensity < minimumContrast) return []
  const cutoff = Math.max(pupilIntensity + minimumContrast, peak - 25)
  const regionWidth = right - left + 1,
    regionHeight = bottom - top + 1
  const visited = new Uint8Array(regionWidth * regionHeight)
  const queue = new Int32Array(visited.length)
  const candidates: Glint[] = []
  const c = Math.cos(pupil.angle),
    s = Math.sin(pupil.angle)
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const seed = (y - top) * regionWidth + x - left
      if (visited[seed] || gray[y * width + x] < cutoff) continue
      visited[seed] = 1
      let head = 0,
        tail = 1,
        sumX = 0,
        sumY = 0,
        sumIntensity = 0
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y
      let edge = false
      queue[0] = seed
      while (head < tail) {
        const index = queue[head++],
          px = left + (index % regionWidth),
          py = top + Math.floor(index / regionWidth)
        sumX += px
        sumY += py
        sumIntensity += gray[py * width + px]
        minX = Math.min(minX, px)
        maxX = Math.max(maxX, px)
        minY = Math.min(minY, py)
        maxY = Math.max(maxY, py)
        if (px === left || px === right || py === top || py === bottom)
          edge = true
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx,
              ny = py + dy
            if (nx < left || nx > right || ny < top || ny > bottom) continue
            const neighbor = (ny - top) * regionWidth + nx - left
            if (!visited[neighbor] && gray[ny * width + nx] >= cutoff) {
              visited[neighbor] = 1
              queue[tail++] = neighbor
            }
          }
      }
      const boxWidth = maxX - minX + 1,
        boxHeight = maxY - minY + 1
      const maxArea = Math.max(12, Math.PI * pupil.major * pupil.minor * 0.05)
      const fill = tail / (boxWidth * boxHeight)
      if (
        edge ||
        tail < 2 ||
        tail > maxArea ||
        fill < 0.4 ||
        Math.max(boxWidth, boxHeight) > Math.max(5, pupil.major * 0.65) ||
        Math.max(boxWidth, boxHeight) / Math.min(boxWidth, boxHeight) > 2.5
      )
        continue
      const center: Point = [sumX / tail, sumY / tail]
      const dx = center[0] - pupil.center[0],
        dy = center[1] - pupil.center[1]
      // Only accept reflections in the pupil/corneal neighborhood, not distant spectacle highlights.
      if (
        Math.hypot(
          (c * dx + s * dy) / pupil.major,
          (-s * dx + c * dy) / pupil.minor
        ) > 1.45
      )
        continue
      const ringRadius = Math.max(boxWidth, boxHeight) * 0.85 + 2
      const ring: number[] = []
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12
        const rx = Math.round(center[0] + Math.cos(angle) * ringRadius)
        const ry = Math.round(center[1] + Math.sin(angle) * ringRadius)
        if (rx >= 0 && rx < width && ry >= 0 && ry < height)
          ring.push(gray[ry * width + rx])
      }
      ring.sort((a, b) => a - b)
      const contrast =
        sumIntensity / tail - (ring[Math.floor(ring.length / 2)] ?? 255)
      if (contrast < 35) continue
      candidates.push({
        center,
        quality: Math.min(1, contrast / 90) * Math.min(1, fill / 0.65),
      })
    }
  return candidates
}

function associateGlint(
  candidates: Glint[],
  pupil: Ellipse,
  previous: IrReference | null
): Glint | null {
  const predicted: Point = previous
    ? [
        previous.glint[0] + pupil.center[0] - previous.pupil.center[0],
        previous.glint[1] + pupil.center[1] - previous.pupil.center[1],
      ]
    : pupil.center
  const radius = Math.sqrt(pupil.major * pupil.minor)
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      distance:
        Math.hypot(
          candidate.center[0] - predicted[0],
          candidate.center[1] - predicted[1]
        ) / radius,
    }))
    .sort((a, b) => a.distance - b.distance)
  const best = ranked[0]
  if (!best || (previous && best.distance > 0.65)) return null
  // Without an identified illuminator, ambiguous bright points are insufficient evidence.
  if (ranked[1] && ranked[1].distance - best.distance < 0.18) return null
  return best.candidate
}

/** Compare independent fresh fits, never a remembered iris center. */
function isNestedPupil(
  smaller: IrPupilCandidate,
  larger: IrPupilCandidate,
  gray: Uint8Array,
  width: number,
  height: number
): boolean {
  const inner = smaller.pupil,
    outer = larger.pupil
  const centerDistance = Math.hypot(
    inner.center[0] - outer.center[0],
    inner.center[1] - outer.center[1]
  )
  const interiorContrast = smaller.bright
    ? smaller.intensity - larger.intensity
    : larger.intensity - smaller.intensity
  if (
    smaller.bright === larger.bright ||
    inner.major >= outer.major * 0.8 ||
    centerDistance > outer.minor * 0.5 ||
    interiorContrast < 10
  )
    return false
  // A compact highlight retains its original-image glint identity even if it
  // also has a well-supported ellipse after inversion.
  if (
    smaller.bright &&
    compactGlints(gray, width, height, outer, larger.intensity, 60).some(
      ({ center }) =>
        Math.hypot(center[0] - inner.center[0], center[1] - inner.center[1]) <=
        Math.max(2, inner.minor * 0.5)
    )
  )
    return false
  const ci = Math.cos(inner.angle),
    si = Math.sin(inner.angle),
    co = Math.cos(outer.angle),
    so = Math.sin(outer.angle)
  // The smaller outline must fit inside the iris, including the observed pupil
  // displacement; size alone cannot identify a pupil among bright distractors.
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI) / 12,
      x =
        inner.center[0] +
        ci * inner.major * Math.cos(angle) -
        si * inner.minor * Math.sin(angle),
      y =
        inner.center[1] +
        si * inner.major * Math.cos(angle) +
        ci * inner.minor * Math.sin(angle),
      dx = x - outer.center[0],
      dy = y - outer.center[1]
    if (
      Math.hypot(
        (co * dx + so * dy) / outer.major,
        (-so * dx + co * dy) / outer.minor
      ) > 1
    )
      return false
  }
  return true
}

/** Fresh pupil and corneal-reflection evidence is required for a PCCR reference.
 * Zero threshold selects auto; manual dark cutoffs are maxima on original pixels,
 * while manual bright cutoffs are minima on original pixels.
 */
export function detectIrEye(
  cv: CV,
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  timestamp: number,
  previous: IrReference | null = null,
  options: IrEyeOptions = {},
  tracking?: IrTrackingState
): IrEyeDetection {
  const reject = (
    reason: string,
    pupil: Ellipse | null = null
  ): IrEyeDetection => ({
    pupil,
    glint: null,
    quality: 0,
    reason,
    reference: null,
  })
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 24 ||
    height < 24 ||
    gray.length !== width * height ||
    !Number.isFinite(timestamp)
  )
    return reject("Select a larger valid eye region")
  const age = previous ? timestamp - previous.timestamp : Infinity
  const recent = age >= 0 && age <= referenceLifetimeMs ? previous : null
  const cutoff = Number.isFinite(threshold)
    ? Math.max(0, Math.min(255, Math.round(threshold)))
    : 0
  const maxRadius = options.maxRadius ?? Infinity
  const expectedCenter = options.expectedCenter
  if (
    maxRadius <= 0 ||
    (options.maxRadius !== undefined && !Number.isFinite(maxRadius)) ||
    (expectedCenter &&
      (!expectedCenter.every(Number.isFinite) ||
        expectedCenter[0] < 0 ||
        expectedCenter[0] >= width ||
        expectedCenter[1] < 0 ||
        expectedCenter[1] >= height))
  )
    return reject("Invalid pupil bounds")
  const centerRadius =
    options.centerRadius ??
    (Number.isFinite(maxRadius) ? maxRadius : Math.hypot(width, height) * 0.25)
  if (!(centerRadius > 0) || !Number.isFinite(centerRadius))
    return reject("Invalid pupil bounds")
  const preferredPolarities =
    (tracking?.polarity ?? recent?.polarity) === "bright"
      ? (["bright", "dark"] as const)
      : (["dark", "bright"] as const)
  const polarities =
    options.polarity === "dark" || options.polarity === "bright"
      ? [options.polarity]
      : preferredPolarities
  const candidates: IrPupilCandidate[] = []
  for (const polarity of polarities) {
    const bright = polarity === "bright"
    // Inversion reverses pupil rim contrast while retaining the shared detector's
    // ellipse, interior, and fresh-shape validation (PuRe section 3.4).
    const pixels = bright ? gray.map((value) => 255 - value) : gray
    const pupilCutoff = bright && cutoff !== 0 ? 255 - cutoff : cutoff
    const samePolarity = tracking && tracking.polarity === polarity
    const detectionOptions = {
      thresholdMode: cutoff === 0 ? ("auto" as const) : ("manual" as const),
      expectedCenter,
      includePreviewMasks: false,
    }
    const detection = samePolarity
      ? tracking.pupils.detect(
          pixels,
          width,
          height,
          pupilCutoff,
          timestamp,
          detectionOptions
        )
      : detectSpatialPupil(cv, pixels, width, height, pupilCutoff, {
          ...detectionOptions,
          previous:
            !tracking && (recent?.polarity ?? "dark") === polarity
              ? recent?.pupil
              : undefined,
          previousAgeMs: age,
          refreshShape: true,
        })
    const pupil = detection.ellipse
    if (
      !pupil ||
      pupil.confidence < (samePolarity ? 0.72 : 0.82) ||
      pupil.minor / pupil.major < 0.35 ||
      pupil.major > maxRadius ||
      (!samePolarity && detection.shapeObserved === false) ||
      (expectedCenter &&
        Math.hypot(
          pupil.center[0] - expectedCenter[0],
          pupil.center[1] - expectedCenter[1]
        ) > centerRadius)
    )
      continue
    const centerIndex =
      Math.round(pupil.center[1]) * width + Math.round(pupil.center[0])
    const intensity =
      detection.pupilIntensity ??
      (samePolarity && detection.shapeObserved === false
        ? tracking.pupils.intensity
        : undefined) ??
      pixels[centerIndex]
    const originalIntensity = bright ? 255 - intensity : intensity
    // A near-saturated interior can be a specular highlight with an elliptical
    // outline. It cannot independently establish a reliable bright pupil.
    if (bright && originalIntensity >= 245) continue
    candidates.push({ pupil, intensity: originalIntensity, bright, detection })
  }
  // A strong iris rim can outrank a smaller bright pupil in the dark branch.
  // Resolve nested opposite-polarity evidence before temporal preference.
  const observed =
    candidates.find((candidate) =>
      candidates.some(
        (other) =>
          candidate !== other &&
          isNestedPupil(candidate, other, gray, width, height)
      )
    ) ?? candidates[0]
  if (!observed) {
    tracking?.pupils.accept(
      {
        ellipse: null,
        seed: null,
        contour: [],
        refined: [],
        previews: [],
        selected: -1,
        reason: "Pupil not found",
      },
      timestamp,
      width,
      height
    )
    return reject("Pupil obscured or eye closed")
  }
  const { intensity: pupilIntensity, bright } = observed
  let pupil = observed.pupil
  if (tracking) {
    const polarity = bright ? "bright" : "dark"
    if (tracking.polarity !== polarity) tracking.pupils.reset()
    const accepted = tracking.pupils.accept(
      observed.detection,
      timestamp,
      width,
      height
    )
    if (!accepted.ellipse) return reject(accepted.reason)
    pupil = accepted.ellipse
    tracking.polarity = polarity
  }
  const glint = associateGlint(
    compactGlints(gray, width, height, pupil, pupilIntensity, bright ? 35 : 60),
    pupil,
    recent
  )
  if (!glint) return reject("Corneal reflection missing or ambiguous", pupil)
  return {
    pupil,
    glint: glint.center,
    quality: Math.min(pupil.confidence, glint.quality),
    reason: null,
    reference: {
      pupil,
      glint: glint.center,
      timestamp,
      polarity: bright ? "bright" : "dark",
    },
  }
}

/** Camera-plane reference compensation; these observations do not provide 6-DOF head pose. */
export function buildIrFeatures(
  pupil: Ellipse,
  glint: Point,
  width: number,
  height: number
): { feature: number[]; pose: HeadPose; basePoint: Point } {
  const radius = Math.sqrt(pupil.major * pupil.minor)
  const dx = (pupil.center[0] - glint[0]) / radius,
    dy = (pupil.center[1] - glint[1]) / radius
  const gx = glint[0] / width,
    gy = glint[1] / height
  const scale = (2 * radius) / Math.sqrt(width * height),
    distance = Math.log(scale)
  return {
    feature: [
      dx,
      dy,
      dx * dx,
      dx * dy,
      dy * dy,
      gx,
      gy,
      distance,
      dx * gx,
      dx * gy,
      dy * gx,
      dy * gy,
      dx * distance,
      dy * distance,
      gx * distance,
      gy * distance,
      pupil.minor / pupil.major,
    ],
    pose: {
      kind: "eye-reference",
      yaw: null,
      pitch: null,
      roll: null,
      x: gx,
      y: gy,
      scale,
    },
    basePoint: [pupil.center[0] / width, pupil.center[1] / height],
  }
}
