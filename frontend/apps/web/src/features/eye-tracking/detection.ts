// Adapted from JEOresearch/EyeTracker (MIT). See research/EyeTracker-LICENSE.
import type { CV } from "./opencv"
import type { Detection, Ellipse, Point } from "./types"
import { finite } from "./geometry"

/** A dimensionless cosine, unlike the reference's unnormalized dot product. */
export function refineContour(points: Point[]): Point[] {
  if (points.length < 6) return []
  const center: Point = [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ]
  const spacing = Math.max(1, Math.floor(points.length / 25))
  return points.filter((p, i) => {
    const before = points[(i - spacing + points.length) % points.length],
      after = points[(i + spacing) % points.length]
    const a: Point = [before[0] - p[0], before[1] - p[1]],
      b: Point = [after[0] - p[0], after[1] - p[1]]
    const la = Math.hypot(...a),
      lb = Math.hypot(...b)
    if (la < 1e-9 || lb < 1e-9) return false
    const inward: Point = [a[0] / la + b[0] / lb, a[1] / la + b[1] / lb],
      toward: Point = [center[0] - p[0], center[1] - p[1]]
    const norm = Math.hypot(...inward) * Math.hypot(...toward)
    return (
      norm > 1e-9 &&
      (inward[0] * toward[0] + inward[1] * toward[1]) / norm >= 0.5
    )
  })
}
function darkestPatch(
  gray: Uint8Array,
  width: number,
  height: number
): { point: Point; value: number } | null {
  const size = Math.max(3, Math.round(Math.min(width, height) / 24)),
    half = Math.floor(size / 2),
    stride = Math.max(2, half)
  let best = Infinity,
    result: { point: Point; value: number } | null = null
  for (let y = half + 2; y < height - half - 2; y += stride)
    for (let x = half + 2; x < width - half - 2; x += stride) {
      let sum = 0,
        sum2 = 0,
        n = 0
      for (let dy = -half; dy <= half; dy += 2)
        for (let dx = -half; dx <= half; dx += 2) {
          const v = gray[(y + dy) * width + x + dx]
          sum += v
          sum2 += v * v
          n++
        }
      const mean = sum / n,
        variance = Math.max(0, sum2 / n - mean * mean),
        score = mean + 0.25 * Math.sqrt(variance)
      if (score < best) {
        best = score
        result = { point: [x, y], value: mean }
      }
    }
  return result
}
function convertEllipse(rect: ReturnType<CV["fitEllipse"]>): Ellipse {
  const width = rect.size.width,
    height = rect.size.height
  let angle = (rect.angle * Math.PI) / 180 + (height > width ? Math.PI / 2 : 0)
  angle = ((angle % Math.PI) + Math.PI) % Math.PI
  return {
    center: [rect.center.x, rect.center.y],
    major: Math.max(width, height) / 2,
    minor: Math.min(width, height) / 2,
    angle,
    confidence: 0,
  }
}
function edgeError(p: Point, e: Ellipse): number {
  const dx = p[0] - e.center[0],
    dy = p[1] - e.center[1],
    c = Math.cos(e.angle),
    s = Math.sin(e.angle)
  return (
    Math.abs(
      Math.hypot((c * dx + s * dy) / e.major, (-s * dx + c * dy) / e.minor) - 1
    ) * e.minor
  )
}
function validEllipse(e: Ellipse, width: number, height: number): boolean {
  return (
    finite([...e.center, e.major, e.minor, e.angle]) &&
    e.minor >= 3 &&
    e.major < Math.min(width, height) * 0.45 &&
    e.minor / e.major >= 0.25 &&
    e.center[0] >= e.major * 0.2 &&
    e.center[1] >= e.major * 0.2 &&
    e.center[0] < width - e.major * 0.2 &&
    e.center[1] < height - e.major * 0.2
  )
}
export function detectSpatialPupil(
  cv: CV,
  gray: Uint8Array,
  width: number,
  height: number,
  thresholdOffset: number
): Detection {
  const result: Detection = {
    ellipse: null,
    seed: null,
    contour: [],
    refined: [],
    previews: [],
    selected: -1,
    reason: "Pupil not found",
  }
  if (width < 24 || height < 24 || gray.length !== width * height)
    return { ...result, reason: "Select a larger eye region" }
  let min = 255,
    max = 0
  for (const v of gray) {
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  if (max - min < 18) return { ...result, reason: "More pupil contrast needed" }
  const patch = darkestPatch(gray, width, height)
  if (!patch) return result
  result.seed = patch.point
  const owned: { delete(): void }[] = []
  const own = <T extends { delete(): void }>(mat: T): T => {
    owned.push(mat)
    return mat
  }
  try {
    const scale = Math.min(width, height) / 480
    const kernel = own(cv.Mat.ones(3, 3, cv.CV_8U))
    let best = 0
    for (const [index, delta] of [5, 15, 25].entries()) {
      const threshold = Math.min(
        245,
        Math.max(0, patch.value + delta + thresholdOffset)
      )
      const data = new Uint8Array(gray.length),
        half = Math.min(
          Math.min(width, height) * 0.48,
          125 * Math.max(0.7, scale)
        )
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (
            Math.abs(x - patch.point[0]) <= half &&
            Math.abs(y - patch.point[1]) <= half &&
            gray[y * width + x] <= threshold
          )
            data[y * width + x] = 255
      const source = own(
          cv.matFromArray(height, width, cv.CV_8UC1, Array.from(data))
        ),
        mask = own(new cv.Mat())
      cv.dilate(
        source,
        mask,
        kernel,
        new cv.Point(-1, -1),
        Math.max(1, Math.round(scale * 4))
      )
      result.previews.push({
        label: ["Strict", "Balanced", "Relaxed"][index],
        threshold: Math.round(threshold),
        mask: new Uint8Array(mask.data),
        score: 0,
      })
      const contours = own(new cv.MatVector()),
        hierarchy = own(new cv.Mat())
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_NONE
      )
      let largest: ReturnType<CV["matFromArray"]> | null = null,
        area = 0
      for (let i = 0; i < contours.size(); i++) {
        const contour = own(contours.get(i)),
          a = cv.contourArea(contour),
          box = cv.boundingRect(contour)
        if (
          box.x <= 1 ||
          box.y <= 1 ||
          box.x + box.width >= width - 1 ||
          box.y + box.height >= height - 1
        )
          continue
        if (
          a < Math.max(35, 1000 * scale * scale) ||
          a > width * height * 0.35 ||
          Math.max(box.width / box.height, box.height / box.width) > 3 ||
          contour.rows < 6
        )
          continue
        if (a > area) {
          largest = contour
          area = a
        }
      }
      if (!largest) continue
      const points: Point[] = []
      for (let i = 0; i < largest.data32S.length; i += 2)
        points.push([largest.data32S[i], largest.data32S[i + 1]])
      const initial = convertEllipse(cv.fitEllipse(largest))
      if (!validEllipse(initial, width, height)) continue
      const tolerance = Math.max(1.5, 4 * scale)
      const overlap =
        points.filter((p) => edgeError(p, initial) <= tolerance).length /
        points.length
      const fill = Math.min(1, area / (Math.PI * initial.major * initial.minor))
      const score =
        fill *
        points.filter((p) => edgeError(p, initial) <= tolerance * 2.5).length **
          2 *
        overlap
      result.previews[index].score = overlap
      if (score <= best) continue
      const refined = refineContour(points)
      if (refined.length < 6 || refined.length < points.length * 0.35) continue
      const refinedMat = own(
        cv.matFromArray(refined.length, 1, cv.CV_32FC2, refined.flat())
      )
      const fitted = convertEllipse(cv.fitEllipse(refinedMat))
      if (!validEllipse(fitted, width, height)) continue
      // Confidence describes the FINAL fit, not an earlier threshold candidate.
      fitted.confidence = Math.min(
        fill,
        points.filter((p) => edgeError(p, fitted) <= tolerance).length /
          points.length
      )
      if (fitted.confidence < 0.65) continue
      best = score
      result.selected = index
      result.contour = points
      result.refined = refined
      result.ellipse = fitted
      result.reason =
        fitted.confidence >= 0.85 ? "Pupil found" : "Pupil fit is weak"
    }
    return result
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete()
  }
}
