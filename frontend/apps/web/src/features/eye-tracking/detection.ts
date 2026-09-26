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
/** Between-class variance gives a second intensity estimate when a lash is darkest. */
function otsuThreshold(gray: Uint8Array): number {
  const histogram = new Uint32Array(256)
  let total = 0
  for (const value of gray) {
    histogram[value]++
    total += value
  }
  let count = 0,
    sum = 0,
    best = -1,
    threshold = 0
  for (let value = 0; value < 255; value++) {
    count += histogram[value]
    sum += value * histogram[value]
    if (!count || count === gray.length) continue
    const difference = sum / count - (total - sum) / (gray.length - count)
    const variance = count * (gray.length - count) * difference ** 2
    if (variance > best) {
      best = variance
      threshold = value
    }
  }
  return threshold
}
function pupilContrast(
  gray: Uint8Array,
  width: number,
  height: number,
  e: Ellipse
) {
  let inside = 0,
    outside = 0,
    ni = 0,
    no = 0
  const interior = new Uint32Array(256)
  const c = Math.cos(e.angle),
    s = Math.sin(e.angle)
  const step = Math.max(1, Math.floor(e.minor / 8))
  const r = Math.ceil(e.major * 1.65)
  for (
    let y = Math.max(0, Math.floor(e.center[1] - r));
    y < Math.min(height, e.center[1] + r);
    y += step
  )
    for (
      let x = Math.max(0, Math.floor(e.center[0] - r));
      x < Math.min(width, e.center[0] + r);
      x += step
    ) {
      const dx = x - e.center[0],
        dy = y - e.center[1]
      const q =
        ((c * dx + s * dy) / e.major) ** 2 + ((-s * dx + c * dy) / e.minor) ** 2
      if (q < 0.64) {
        inside += gray[y * width + x]
        interior[gray[y * width + x]]++
        ni++
      } else if (q > 1.15 ** 2 && q < 1.65 ** 2) {
        outside += gray[y * width + x]
        no++
      }
    }
  if (!ni || !no) return { contrast: 0, homogeneity: 0 }
  let count = 0,
    low = -1,
    high = 255
  for (let value = 0; value < 256; value++) {
    count += interior[value]
    if (low < 0 && count >= ni * 0.2) low = value
    if (count >= ni * 0.8) {
      high = value
      break
    }
  }
  // Trimmed intensity spread tolerates small glints, but penalizes an iris enclosing a darker pupil.
  return {
    contrast: outside / no - inside / ni,
    homogeneity: 1 / (1 + (high - low) / 35),
  }
}
export type PupilDetectionOptions = {
  thresholdMode?: "auto" | "manual"
  previous?: Ellipse | null
}
export function detectSpatialPupil(
  cv: CV,
  gray: Uint8Array,
  width: number,
  height: number,
  thresholdOffset: number,
  options: PupilDetectionOptions = {}
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
  const patch = darkestPatch(gray, width, height)
  if (!patch) return result
  result.seed = patch.point
  const otsu = otsuThreshold(gray)
  const thresholds =
    options.thresholdMode === "manual"
      ? [Math.round(Math.max(0, Math.min(255, thresholdOffset)))]
      : [5, 15, 25].map((delta, index) =>
          Math.round(
            Math.max(
              0,
              Math.min(
                245,
                Math.max(patch.value + delta, otsu * [0.55, 0.8, 1][index]) +
                  thresholdOffset
              )
            )
          )
        )
  const owned: { delete(): void }[] = []
  const own = <T extends { delete(): void }>(value: T): T => {
    owned.push(value)
    return value
  }
  try {
    const scale = Math.min(width, height) / 480
    let best = -Infinity
    for (const [index, threshold] of thresholds.entries()) {
      // Segment the ENTIRE user-selected ROI. No moving window around a dark lash.
      const data = Uint8Array.from(gray, (value) =>
        value <= threshold ? 255 : 0
      )
      result.previews.push({
        label:
          options.thresholdMode === "manual"
            ? "Manual"
            : ["Strict", "Balanced", "Relaxed"][index],
        threshold,
        mask: data,
        score: 0,
      })
      const mask = own(new cv.Mat(height, width, cv.CV_8UC1))
      mask.data.set(data)
      const contours = own(new cv.MatVector()),
        hierarchy = own(new cv.Mat())
      cv.findContours(
        mask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_NONE
      )
      for (let i = 0; i < contours.size(); i++) {
        const contour = own(contours.get(i)),
          area = cv.contourArea(contour),
          box = cv.boundingRect(contour)
        if (
          box.x <= 1 ||
          box.y <= 1 ||
          box.x + box.width >= width - 1 ||
          box.y + box.height >= height - 1
        )
          continue
        if (
          area < 28 ||
          area > width * height * 0.45 ||
          Math.max(box.width / box.height, box.height / box.width) > 4 ||
          contour.rows < 6
        )
          continue
        const points: Point[] = []
        for (let j = 0; j < contour.data32S.length; j += 2)
          points.push([contour.data32S[j], contour.data32S[j + 1]])
        const initial = convertEllipse(cv.fitEllipse(contour))
        if (!validEllipse(initial, width, height)) continue
        const refined = refineContour(points)
        if (refined.length < 6 || refined.length < points.length * 0.35)
          continue
        const refinedMat = own(
          cv.matFromArray(refined.length, 1, cv.CV_32FC2, refined.flat())
        )
        const fitted = convertEllipse(cv.fitEllipse(refinedMat))
        if (!validEllipse(fitted, width, height)) continue
        const tolerance = Math.max(1.5, 4 * scale)
        const fill = Math.min(1, area / (Math.PI * fitted.major * fitted.minor))
        fitted.confidence = Math.min(
          fill,
          points.filter((p) => edgeError(p, fitted) <= tolerance).length /
            points.length
        )
        const { contrast, homogeneity } = pupilContrast(
          gray,
          width,
          height,
          fitted
        )
        if (fitted.confidence < 0.65 || contrast < 8) continue
        result.previews[index].score = Math.max(
          result.previews[index].score,
          fitted.confidence
        )
        // Comparable, dimensionless scores: large shadows no longer win by area².
        let score =
          fitted.confidence *
          (0.65 + 0.35 * Math.min(1, contrast / 100)) *
          homogeneity
        if (options.previous) {
          const previous = options.previous
          const distance = Math.hypot(
            fitted.center[0] - previous.center[0],
            fitted.center[1] - previous.center[1]
          )
          const position = Math.exp(
            -0.5 *
              (distance /
                Math.max(previous.major * 2, Math.min(width, height) * 0.1)) **
                2
          )
          const size = Math.exp(
            -2 * Math.abs(Math.log(fitted.major / previous.major))
          )
          score *= 0.35 + 0.65 * position * size
        }
        if (score <= best) continue
        best = score
        result.selected = index
        result.contour = points
        result.refined = refined
        result.ellipse = fitted
        result.reason =
          fitted.confidence >= 0.82 ? "Pupil found" : "Pupil fit is weak"
      }
    }
    if (result.selected < 0 && result.previews.length)
      result.selected = options.thresholdMode === "manual" ? 0 : 1
    return result
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete()
  }
}
