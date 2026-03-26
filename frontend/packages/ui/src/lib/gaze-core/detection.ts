import { PUPIL_THRESH_MIN, sliderToThreshold } from "./constants"
import { clamp } from "./math"
import {
  adaptiveInv,
  and,
  componentMean,
  components,
  count,
  gaussian,
  morph,
  percentile,
} from "./image"
import type { Component, Detection, Ellipse, Point } from "./types"

export function detectPupil(
  gray: Uint8Array,
  width: number,
  height: number,
  center: Point,
  blurSize: number,
  threshold: number,
): Detection {
  const blur = gaussian(gray, width, height, blurSize)
  const mappedThreshold = sliderToThreshold(threshold)

  const binary = new Uint8Array(blur.length)
  for (let i = 0; i < blur.length; i += 1) {
    binary[i] = blur[i] > mappedThreshold ? 0 : 255
  }

  const adaptiveBlock = Math.max(11, blurSize * 5)
  const adaptiveC = clamp(Math.floor(threshold * 0.25), 2, 15)
  const adaptive = adaptiveInv(blur, width, height, adaptiveBlock, adaptiveC)

  const darkCutoff = percentile(blur, 0.18)
  const dark = new Uint8Array(blur.length)
  for (let i = 0; i < blur.length; i += 1) dark[i] = blur[i] <= darkCutoff ? 255 : 0

  let mask = threshold <= PUPIL_THRESH_MIN ? new Uint8Array(blur.length) : and(binary, and(adaptive, dark))
  if (count(mask) < Math.max(12, Math.floor(width * height * 0.00015))) {
    mask = binary
  }
  mask = morph(mask, width, height)

  const candidates = components(mask, width, height)
  const minArea = Math.max(60, Math.floor(width * height * 0.0008))
  const maxArea = Math.max(minArea + 1, Math.floor(width * height * 0.06))
  const targetArea = Math.max(minArea, Math.floor(width * height * 0.02))

  let best: Component | null = null
  let bestScore = -1

  for (const c of candidates) {
    if (c.area < minArea || c.area > maxArea || c.perimeter <= 0) continue

    const circularity = clamp((4 * Math.PI * c.area) / (c.perimeter * c.perimeter), 0, 1)
    const aspect = clamp(Math.min(c.bbox.width, c.bbox.height) / Math.max(c.bbox.width, c.bbox.height), 0, 1)
    if (aspect < 0.35) continue

    const fill = clamp(c.area / (c.bbox.width * c.bbox.height), 0, 1)
    const darkness = clamp(1 - componentMean(c, gray, width) / 255, 0, 1)

    const cx = c.bbox.x + c.bbox.width / 2
    const cy = c.bbox.y + c.bbox.height / 2
    const distance = Math.hypot(cx - center[0], cy - center[1])
    const distanceScore = 1 - clamp(distance / Math.max(1, Math.max(width, height) * 0.7), 0, 1)
    const areaScore = 1 - clamp(Math.abs(c.area - targetArea) / Math.max(1, targetArea), 0, 1)
    const edge = Math.min(c.bbox.x, c.bbox.y, width - (c.bbox.x + c.bbox.width), height - (c.bbox.y + c.bbox.height))
    const edgeScore = clamp(edge / Math.max(1, Math.min(width, height) * 0.25), 0, 1)

    const score =
      circularity * 0.22
      + darkness * 0.25
      + fill * 0.15
      + aspect * 0.08
      + areaScore * 0.1
      + distanceScore * 0.15
      + edgeScore * 0.05

    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  if (!best) {
    return {
      pupilCenter: null,
      pupilEllipse: null,
      pupilMask: mask.slice(),
      thresholdPreview: mask.slice(),
      score: -1,
    }
  }

  const pupilMask = new Uint8Array(mask.length)
  for (let i = 0; i < best.points.length; i += 2) {
    pupilMask[best.points[i + 1] * width + best.points[i]] = 255
  }

  const pupilCenter: Point = [Math.round(best.sumX / best.area), Math.round(best.sumY / best.area)]
  const pupilEllipse = fitEllipse(best.points, pupilCenter, best.area)

  return {
    pupilCenter,
    pupilEllipse,
    pupilMask,
    thresholdPreview: mask.slice(),
    score: bestScore,
  }
}

export function detectGlint(
  gray: Uint8Array,
  width: number,
  height: number,
  blurSize: number,
  threshold: number,
): Point | null {
  const blur = gaussian(gray, width, height, blurSize)
  const mask = new Uint8Array(blur.length)
  for (let i = 0; i < blur.length; i += 1) {
    mask[i] = blur[i] > threshold ? 255 : 0
  }

  const glints = components(mask, width, height)
  for (const g of glints) {
    if (g.area > 2) {
      return [Math.round(g.sumX / g.area), Math.round(g.sumY / g.area)]
    }
  }
  return null
}

function fitEllipse(points: number[], fallback: Point, area: number): Ellipse {
  if (points.length < 10) {
    const d = Math.max(4, 2 * Math.sqrt(Math.max(1, area) / Math.PI))
    return {
      center: [fallback[0], fallback[1]],
      axes: [d, d],
      angle: 0,
    }
  }

  const count = points.length / 2
  let mx = 0
  let my = 0
  for (let i = 0; i < points.length; i += 2) {
    mx += points[i]
    my += points[i + 1]
  }
  mx /= count
  my /= count

  let cxx = 0
  let cyy = 0
  let cxy = 0
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i] - mx
    const dy = points[i + 1] - my
    cxx += dx * dx
    cyy += dy * dy
    cxy += dx * dy
  }
  cxx /= count
  cyy /= count
  cxy /= count

  const trace = cxx + cyy
  const determinant = cxx * cyy - cxy * cxy
  const root = Math.sqrt(Math.max(0, trace * trace - 4 * determinant))
  const l1 = Math.max(1e-6, 0.5 * (trace + root))
  const l2 = Math.max(1e-6, 0.5 * (trace - root))
  const axisA = Math.max(4, 4 * Math.sqrt(l1))
  const axisB = Math.max(4, 4 * Math.sqrt(l2))
  const angle = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI

  return {
    center: [mx, my],
    axes: [axisA, axisB],
    angle,
  }
}
