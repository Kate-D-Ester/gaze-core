// Adapted from JEOresearch/EyeTracker (MIT). See research/EyeTracker-LICENSE.
import type { CV } from "./opencv.types"
import type { Detection, Ellipse, Point } from "./eye-tracking.types"
import type {
  CvOwnedObject,
  DarkestPatch,
  PupilDetectionOptions,
} from "./detection.types"
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
): DarkestPatch | null {
  const size = Math.max(3, Math.round(Math.min(width, height) / 24)),
    half = Math.floor(size / 2),
    stride = Math.max(2, half)
  let best = Infinity,
    result: DarkestPatch | null = null
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
export function isContinuousPupil(
  candidate: Ellipse,
  previous: Ellipse,
  width: number,
  height: number
): boolean {
  const distance = Math.hypot(
    candidate.center[0] - previous.center[0],
    candidate.center[1] - previous.center[1]
  )
  return (
    distance <= Math.max(previous.major * 2, Math.min(width, height) * 0.18) &&
    candidate.major / previous.major >= 0.6 &&
    candidate.major / previous.major <= 1.6 &&
    candidate.minor / previous.minor >= 0.45 &&
    candidate.minor / previous.minor <= 2.2
  )
}
/** Fit remaining rim arcs without treating a reflection's inward notch as pupil boundary. */
function recoverPupilRim(
  cv: CV,
  points: Point[],
  refined: Point[],
  initial: Ellipse,
  area: number,
  width: number,
  height: number
): Ellipse | null {
  const fit = (sample: Point[]): Ellipse | null => {
    if (sample.length < 6) return null
    const mat = cv.matFromArray(sample.length, 1, cv.CV_32FC2, sample.flat())
    try {
      const ellipse = convertEllipse(cv.fitEllipse(mat))
      return validEllipse(ellipse, width, height) ? ellipse : null
    } finally {
      mat.delete()
    }
  }
  const support = (ellipse: Ellipse) => {
    const tolerance = Math.max(1.5, ellipse.minor * 0.045)
    const inliers = points.filter((p) => edgeError(p, ellipse) <= tolerance)
    // Counting angular sectors prevents a long reflection edge from dominating the fit.
    const sectors = new Set<number>()
    const c = Math.cos(ellipse.angle),
      s = Math.sin(ellipse.angle)
    for (const [x, y] of inliers) {
      const dx = x - ellipse.center[0],
        dy = y - ellipse.center[1]
      const angle = Math.atan2(
        (-s * dx + c * dy) / ellipse.minor,
        (c * dx + s * dy) / ellipse.major
      )
      sectors.add(Math.min(31, Math.floor(((angle + Math.PI) * 16) / Math.PI)))
    }
    const fill = area / (Math.PI * ellipse.major * ellipse.minor)
    const confidence = Math.min(1, fill, sectors.size / 32)
    // A few arcs cannot justify reconstructing an otherwise missing pupil.
    if (fill < 0.75 || fill > 1.15 || inliers.length < points.length * 0.55)
      return null
    return {
      ellipse: { ...ellipse, confidence },
      inliers,
      score: confidence + (0.05 * inliers.length) / points.length,
    }
  }
  let best = support(initial)
  let seed = 1729
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  // Deterministic, stratified trials cover the contour without relying on one unbroken arc.
  for (let trial = 0; trial < 32; trial++) {
    const sample = Array.from(
      { length: 8 },
      (_, i) =>
        refined[
          Math.min(
            refined.length - 1,
            Math.floor(((i + random()) * refined.length) / 8)
          )
        ]
    )
    const ellipse = fit(sample)
    if (!ellipse) continue
    const candidate = support(ellipse)
    if (candidate && (!best || candidate.score > best.score)) best = candidate
  }
  if (!best) return null
  const refitted = fit(best.inliers)
  const candidate = refitted && support(refitted)
  if (candidate && candidate.score >= best.score) best = candidate
  return best.ellipse
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
      : [5, 15, 25].map((delta, index) => {
          const threshold =
            Math.max(patch.value + delta, otsu * [0.55, 0.8, 1][index]) +
            thresholdOffset
          return Math.round(Math.max(0, Math.min(245, threshold)))
        })
  const labels =
    options.thresholdMode === "manual"
      ? ["Manual"]
      : ["Strict", "Balanced", "Relaxed"]
  result.previews = thresholds.map((threshold, index) => ({
    label: labels[index],
    threshold,
    score: 0,
  }))
  const canUseTrackingFastPath =
    options.evaluateAllThresholds === false &&
    options.previous !== null &&
    options.previous !== undefined &&
    options.previousSelected !== undefined &&
    options.previousSelected >= 0 &&
    options.previousSelected < thresholds.length &&
    thresholds.length > 1
  const passOrder = thresholds.map((_, index) => index)
  if (canUseTrackingFastPath) {
    passOrder.splice(options.previousSelected!, 1)
    passOrder.unshift(options.previousSelected!)
  }
  const owned: CvOwnedObject[] = []
  const own = <T extends { delete(): void }>(value: T): T => {
    owned.push(value)
    return value
  }
  try {
    const scale = Math.min(width, height) / 480
    // Opening removes narrow lash strands and thin bridges while preserving a
    // pupil-sized dark region. Keep it small relative to the camera crop.
    const kernelSize = Math.min(7, Math.max(3, Math.round(scale * 6) | 1))
    const kernel = own(
      cv.getStructuringElement(
        cv.MORPH_ELLIPSE,
        new cv.Size(kernelSize, kernelSize)
      )
    )
    let best = -Infinity
    let bestContinuous = -Infinity
    type Candidate = {
      score: number
      index: number
      points: Point[]
      refined: Point[]
      ellipse: Ellipse
    }
    let bestCandidate: Candidate | null = null
    let bestContinuousCandidate: Candidate | null = null
    let irregular = false
    for (const index of passOrder) {
      const threshold = thresholds[index]
      // Segment the full ROI, then remove thin lash-shaped structures before
      // contour search. The preview shows this same filtered mask.
      const mask = own(new cv.Mat(height, width, cv.CV_8UC1))
      for (let i = 0; i < gray.length; i++)
        mask.data[i] = gray[i] <= threshold ? 255 : 0
      const filtered = own(new cv.Mat())
      cv.morphologyEx(mask, filtered, cv.MORPH_OPEN, kernel)
      if (options.includePreviewMasks !== false)
        result.previews[index].mask = Uint8Array.from(filtered.data)
      const contours = own(new cv.MatVector()),
        hierarchy = own(new cv.Mat())
      cv.findContours(
        filtered,
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
        let fitted = convertEllipse(cv.fitEllipse(refinedMat))
        if (!validEllipse(fitted, width, height)) continue
        const tolerance = Math.max(1.5, 4 * scale)
        const fill = Math.min(1, area / (Math.PI * fitted.major * fitted.minor))
        fitted.confidence = Math.min(
          fill,
          points.filter((p) => edgeError(p, fitted) <= tolerance).length /
            points.length
        )
        if (fitted.confidence < 0.85) {
          const recovered = recoverPupilRim(
            cv,
            points,
            refined,
            fitted,
            area,
            width,
            height
          )
          if (recovered && recovered.confidence > fitted.confidence)
            fitted = recovered
        }
        const { contrast, homogeneity } = pupilContrast(
          gray,
          width,
          height,
          fitted
        )
        if (fitted.confidence < 0.65 || contrast < 8) {
          if (area > 100 && contrast >= 8) irregular = true
          continue
        }
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
        // Only switch threshold bands for a meaningful improvement in candidate quality.
        if (index === options.previousSelected) score += 0.03
        const candidate = { score, index, points, refined, ellipse: fitted }
        if (score > best) {
          best = score
          bestCandidate = candidate
        }
        const continuous =
          !options.previous ||
          isContinuousPupil(fitted, options.previous, width, height)
        if (continuous && score > bestContinuous) {
          bestContinuous = score
          bestContinuousCandidate = candidate
        }
      }
      if (
        canUseTrackingFastPath &&
        bestContinuousCandidate?.index === options.previousSelected &&
        bestContinuousCandidate.ellipse.confidence >= 0.82
      )
        break
    }
    // Prefer a candidate consistent with the last pupil. If none is nearby,
    // return the best alternative so the engine can confirm a real saccade.
    const winner = bestContinuousCandidate ?? bestCandidate
    if (winner) {
      result.selected = winner.index
      result.contour = winner.points
      result.refined = winner.refined
      result.ellipse = winner.ellipse
      result.reason =
        winner.ellipse.confidence >= 0.82 ? "Pupil found" : "Pupil fit is weak"
    }
    if (result.selected < 0 && result.previews.length) {
      const previous = options.previousSelected
      const previousIsAvailable =
        previous !== undefined &&
        previous >= 0 &&
        previous < result.previews.length

      if (previousIsAvailable) {
        result.selected = previous
      } else if (options.thresholdMode === "manual") {
        result.selected = 0
      } else {
        result.selected = 1
      }
      if (irregular)
        result.reason = "Outline too irregular · adjust cutoff or reduce glare"
    }
    return result
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete()
  }
}
