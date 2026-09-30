import { detectSpatialPupil } from "../eye-tracking/detection"
import type { CV } from "../eye-tracking/opencv.types"
import type { Ellipse } from "../eye-tracking/eye-tracking.types"
import type { HeadPose, Point } from "./types"

export type IrReference = { pupil: Ellipse; glint: Point; timestamp: number }
export type IrEyeDetection = {
  pupil: Ellipse | null
  glint: Point | null
  quality: number
  reason: string | null
  reference: IrReference | null
}
type Glint = { center: Point; quality: number }
const referenceLifetimeMs = 250

function compactGlints(
  gray: Uint8Array,
  width: number,
  height: number,
  pupil: Ellipse,
  pupilIntensity: number
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
  if (peak - pupilIntensity < 60) return []
  const cutoff = Math.max(pupilIntensity + 60, peak - 25)
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

/** Fresh pupil and corneal-reflection evidence is required on every frame. */
export function detectIrEye(
  cv: CV,
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  timestamp: number,
  previous: IrReference | null = null
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
  const detection = detectSpatialPupil(cv, gray, width, height, cutoff, {
    thresholdMode: cutoff === 0 ? "auto" : "manual",
    previous: recent?.pupil,
    previousAgeMs: age,
    includePreviewMasks: false,
    refreshShape: true,
  })
  const pupil = detection.ellipse
  if (
    !pupil ||
    pupil.confidence < 0.82 ||
    pupil.minor / pupil.major < 0.35 ||
    detection.shapeObserved === false
  )
    return reject("Pupil obscured or eye closed")
  const centerIndex =
    Math.round(pupil.center[1]) * width + Math.round(pupil.center[0])
  const pupilIntensity =
    detection.pupilIntensity ?? Math.min(gray[centerIndex], cutoff || 90)
  const glint = associateGlint(
    compactGlints(gray, width, height, pupil, pupilIntensity),
    pupil,
    recent
  )
  if (!glint) return reject("Corneal reflection missing or ambiguous", pupil)
  return {
    pupil,
    glint: glint.center,
    quality: Math.min(pupil.confidence, glint.quality),
    reason: null,
    reference: { pupil, glint: glint.center, timestamp },
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
