// Adapted from JEOresearch/EyeTracker (MIT). See research/EyeTracker-LICENSE.
import type { CV } from "./opencv.types"
import type { Detection, Ellipse, Point } from "./eye-tracking.types"
import type {
  CvOwnedObject,
  DarkestPatch,
  PupilBoundaryEvidence,
  PupilCandidate,
  PupilContourRegion,
  PupilDetectionOptions,
  PupilProposal,
  PupilRimSample,
} from "./detection.types"
import { finite } from "./geometry"

const maxContourCandidates = 24
const maxContourPoints = 256
const recoveryTrials = 24
const rimDirections: Point[] = Array.from({ length: 64 }, (_, i) => [
  Math.cos((i * Math.PI) / 32),
  Math.sin((i * Math.PI) / 32),
])

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

/** Open edge chains have no meaningful centroid. Keep bends, excluding straight runs and reversals. */
function curvedEdgePoints(points: Point[]): Point[] {
  const spacing = Math.max(2, Math.floor(points.length / 64))
  return points.filter((point, i) => {
    if (i < spacing || i + spacing >= points.length) return false
    const before = points[i - spacing],
      after = points[i + spacing],
      ax = before[0] - point[0],
      ay = before[1] - point[1],
      bx = after[0] - point[0],
      by = after[1] - point[1],
      a = Math.hypot(ax, ay),
      b = Math.hypot(bx, by)
    if (a < 1 || b < 1 || Math.max(a, b) > Math.min(a, b) * 4) return false
    const bend = Math.hypot(ax / a + bx / b, ay / a + by / b)
    return bend > 0.08 && bend < 1.6
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
  const c = Math.cos(e.angle),
    s = Math.sin(e.angle),
    radiusX = Math.hypot(e.major * c, e.minor * s),
    radiusY = Math.hypot(e.major * s, e.minor * c)
  return (
    finite([...e.center, e.major, e.minor, e.angle]) &&
    e.minor >= 3 &&
    e.minor / e.major >= 0.2 &&
    radiusX < width * 0.6 &&
    radiusY < height * 0.6 &&
    e.center[0] >= 0 &&
    e.center[1] >= 0 &&
    e.center[0] < width &&
    e.center[1] < height
  )
}

function sampleGray(
  gray: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): number | null {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return null
  const ix = Math.floor(x),
    iy = Math.floor(y),
    dx = x - ix,
    dy = y - iy,
    index = iy * width + ix
  return (
    (1 - dy) * ((1 - dx) * gray[index] + dx * gray[index + 1]) +
    dy * ((1 - dx) * gray[index + width] + dx * gray[index + width + 1])
  )
}

/** A lash can be dark and elliptical locally; require outward contrast around the rim. */
function boundaryEvidence(
  gray: Uint8Array,
  width: number,
  height: number,
  e: Ellipse
): PupilBoundaryEvidence {
  const c = Math.cos(e.angle),
    s = Math.sin(e.angle),
    step = Math.max(1.5, Math.min(5, e.minor * 0.12)),
    differences: number[] = []
  for (const [ca, sa] of rimDirections) {
    const x = e.center[0] + c * e.major * ca - s * e.minor * sa,
      y = e.center[1] + s * e.major * ca + c * e.minor * sa,
      nx = (c * ca) / e.major - (s * sa) / e.minor,
      ny = (s * ca) / e.major + (c * sa) / e.minor,
      length = Math.hypot(nx, ny),
      dx = (nx * step) / length,
      dy = (ny * step) / length,
      inside = sampleGray(gray, width, height, x - dx, y - dy),
      outside = sampleGray(gray, width, height, x + dx, y + dy)
    if (inside !== null && outside !== null && outside - inside >= 6)
      differences.push(outside - inside)
  }
  differences.sort((a, b) => a - b)
  return {
    support: differences.length / 64,
    contrast: differences[Math.floor(differences.length / 2)] ?? 0,
  }
}

/** During partial occlusion, solve only translation from fresh edge measurements.
 * Holding the last measured axes avoids an unconstrained ellipse fit collapsing
 * onto the lid. A poorly conditioned or unsupported translation is rejected.
 */
function trackPartialRim(
  gray: Uint8Array,
  width: number,
  height: number,
  previous: Ellipse,
  samples: PupilRimSample[],
  band: number
): PupilCandidate | null {
  const solve = (inliers: PupilRimSample[]): Point | null => {
    let xx = 0,
      xy = 0,
      yy = 0,
      bx = 0,
      by = 0
    for (const {
      normal: [nx, ny],
      offset,
    } of inliers) {
      xx += nx * nx
      xy += nx * ny
      yy += ny * ny
      bx += nx * offset
      by += ny * offset
    }
    const determinant = xx * yy - xy * xy
    if (determinant < xx * yy * 0.2 || determinant < 1e-6) return null
    const dx = (yy * bx - xy * by) / determinant,
      dy = (xx * by - xy * bx) / determinant
    if (Math.hypot(dx, dy) > band) return null
    return [dx, dy]
  }
  const supporting = ([dx, dy]: Point) =>
    samples.filter(
      ({ normal: [nx, ny], offset }) =>
        Math.abs(nx * dx + ny * dy - offset) <= 2
    )
  // Lash edges are outliers. Seed translation with bounded pairs before least-squares refinement.
  if (samples.length < 20) return null
  let inliers: PupilRimSample[] = []
  for (let trial = 0; trial < 24; trial++) {
    const first = Math.floor(((trial + 0.5) * samples.length) / 24),
      second =
        (first +
          Math.max(
            1,
            Math.floor(samples.length * (0.25 + (trial % 3) * 0.125))
          )) %
        samples.length,
      translation = solve([samples[first], samples[second]])
    if (!translation) continue
    const candidate = supporting(translation)
    if (candidate.length > inliers.length) inliers = candidate
  }
  if (inliers.length < Math.max(20, samples.length * 0.45)) return null
  let translation = solve(inliers)
  if (!translation) return null
  inliers = supporting(translation)
  if (inliers.length < 20) return null
  translation = solve(inliers)
  if (!translation) return null
  const [dx, dy] = translation
  const ellipse: Ellipse = {
    ...previous,
    center: [previous.center[0] + dx, previous.center[1] + dy],
  }
  if (!validEllipse(ellipse, width, height)) return null
  const boundary = boundaryEvidence(gray, width, height, ellipse)
  if (boundary.support < 0.4 || boundary.contrast < 10) return null
  ellipse.confidence = Math.min(0.8, 0.6 + 0.35 * boundary.support)
  const points = samples.map((sample) => sample.point),
    refined = inliers.map((sample) => sample.point)
  return {
    ellipse,
    points,
    refined,
    index: 0,
    score: ellipse.confidence,
    shapeObserved: false,
  }
}

/** Track observed edges near the last rim before attempting another segmentation.
 * The outline-first strategy follows PuReST's separation of tracking and detection;
 * this implementation samples grayscale normal profiles, not their Canny pipeline.
 */
function trackPupilRim(
  cv: CV,
  gray: Uint8Array,
  width: number,
  height: number,
  previous: Ellipse,
  anchor: Ellipse
): PupilCandidate | null {
  if (!validEllipse(previous, width, height)) return null
  const band = Math.max(3, Math.min(12, Math.round(previous.minor * 0.22))),
    probe = Math.max(1, Math.min(2.5, previous.minor * 0.07)),
    c = Math.cos(previous.angle),
    s = Math.sin(previous.angle),
    samples: PupilRimSample[] = [],
    profile = new Float64Array(band * 2 + 1)

  for (const [ca, sa] of rimDirections) {
    const x =
        previous.center[0] + c * previous.major * ca - s * previous.minor * sa,
      y =
        previous.center[1] + s * previous.major * ca + c * previous.minor * sa,
      normalX = (c * ca) / previous.major - (s * sa) / previous.minor,
      normalY = (s * ca) / previous.major + (c * sa) / previous.minor,
      length = Math.hypot(normalX, normalY),
      nx = normalX / length,
      ny = normalY / length
    let peak = -1,
      best = 6
    for (let offset = -band; offset <= band; offset++) {
      const inside = sampleGray(
          gray,
          width,
          height,
          x + (offset - probe) * nx,
          y + (offset - probe) * ny
        ),
        outside = sampleGray(
          gray,
          width,
          height,
          x + (offset + probe) * nx,
          y + (offset + probe) * ny
        ),
        gradient = inside === null || outside === null ? 0 : outside - inside
      profile[offset + band] = gradient
      const score = gradient / (1 + 0.02 * Math.abs(offset))
      if (score > best) {
        best = score
        peak = offset + band
      }
    }
    if (peak <= 0 || peak >= profile.length - 1) continue
    // Center a derivative peak instead of retaining the old pixel on a flat peak.
    let weight = 0,
      position = 0
    for (
      let i = Math.max(0, peak - 2);
      i <= Math.min(profile.length - 1, peak + 2);
      i++
    ) {
      const w = Math.max(0, profile[i] - profile[peak] * 0.5)
      weight += w
      position += (i - band) * w
    }
    if (!weight) continue
    const offset = position / weight,
      px = x + offset * nx,
      py = y + offset * ny,
      inside = sampleGray(
        gray,
        width,
        height,
        px - 2 * probe * nx,
        py - 2 * probe * ny
      ),
      outside = sampleGray(
        gray,
        width,
        height,
        px + 2 * probe * nx,
        py + 2 * probe * ny
      )
    // Thin lashes have bright pixels on both sides; a pupil edge has a dark interior.
    if (inside !== null && outside !== null && outside - inside >= 10)
      samples.push({ point: [px, py], normal: [nx, ny], offset })
  }
  const points = samples.map((sample) => sample.point),
    partial = () =>
      trackPartialRim(gray, width, height, previous, samples, band)
  if (points.length < 36) return partial()

  const fit = (sample: Point[]) => {
    const mat = cv.matFromArray(sample.length, 1, cv.CV_32FC2, sample.flat())
    try {
      return convertEllipse(cv.fitEllipse(mat))
    } finally {
      mat.delete()
    }
  }
  let refined = points,
    ellipse = fit(refined)
  for (let iteration = 0; iteration < 2; iteration++) {
    if (!validEllipse(ellipse, width, height)) return partial()
    const tolerance = Math.max(1.25, Math.min(3, ellipse.minor * 0.07))
    refined = refined.filter((point) => edgeError(point, ellipse) <= tolerance)
    if (refined.length < 32) return partial()
    ellipse = fit(refined)
  }
  if (
    !validEllipse(ellipse, width, height) ||
    Math.hypot(
      ellipse.center[0] - previous.center[0],
      ellipse.center[1] - previous.center[1]
    ) >
      band * 1.5 ||
    ellipse.major / previous.major < 0.8 ||
    ellipse.major / previous.major > 1.25 ||
    ellipse.minor / previous.minor < 0.8 ||
    ellipse.minor / previous.minor > 1.25 ||
    ellipse.major / anchor.major > 1.2
  )
    return partial()

  const sectors = new Set<number>(),
    ec = Math.cos(ellipse.angle),
    es = Math.sin(ellipse.angle)
  for (const [x, y] of refined) {
    const dx = x - ellipse.center[0],
      dy = y - ellipse.center[1],
      angle = Math.atan2(
        (-es * dx + ec * dy) / ellipse.minor,
        (ec * dx + es * dy) / ellipse.major
      )
    sectors.add(Math.min(31, Math.floor(((angle + Math.PI) * 16) / Math.PI)))
  }
  // Support must be spread around the pupil; a single eyelid arc is insufficient.
  let gap = 0
  for (let i = 0; i < 64; i++) {
    gap = sectors.has(i % 32) ? 0 : gap + 1
    if (gap > 12) return partial()
  }
  const boundary = boundaryEvidence(gray, width, height, ellipse)
  if (boundary.support < 0.8) {
    const translated = partial()
    if (translated) return translated
  }
  if (sectors.size < 18 || boundary.support < 0.55 || boundary.contrast < 10)
    return partial()
  ellipse.confidence = Math.min(
    0.99,
    0.55 + 0.45 * boundary.support,
    refined.length / points.length
  )
  if (ellipse.confidence < 0.72) return partial()
  return { ellipse, points, refined, index: 0, score: ellipse.confidence }
}

/** Recenter a recently tracked shape after a saccade, including partial lash occlusion. */
function relocatePupilRim(
  cv: CV,
  gray: Uint8Array,
  width: number,
  height: number,
  previous: Ellipse,
  anchor: Ellipse
): PupilCandidate | null {
  const radius = Math.max(12, Math.min(96, previous.major * 1.6)),
    step = Math.max(4, Math.ceil(radius / 8)),
    seeds: Pick<PupilCandidate, "ellipse" | "score">[] = []
  // At most 17 × 17 center hypotheses; there is no image pyramid or full-frame search here.
  for (let dy = -8; dy <= 8; dy++)
    for (let dx = -8; dx <= 8; dx++) {
      const distance = Math.hypot(dx * step, dy * step)
      if (distance > radius || distance < step) continue
      const ellipse: Ellipse = {
        ...previous,
        center: [
          previous.center[0] + dx * step,
          previous.center[1] + dy * step,
        ],
      }
      if (!validEllipse(ellipse, width, height)) continue
      const boundary = boundaryEvidence(gray, width, height, ellipse)
      if (boundary.support < 0.4 || boundary.contrast < 10) continue
      const score =
        boundary.support * (0.6 + 0.4 * Math.min(1, boundary.contrast / 40)) -
        (0.05 * distance) / radius
      seeds.push({ ellipse, score })
      seeds.sort((a, b) => b.score - a.score)
      if (seeds.length > 3) seeds.pop()
    }
  for (const seed of seeds) {
    const tracked = trackPupilRim(cv, gray, width, height, seed.ellipse, anchor)
    if (
      tracked &&
      pupilContrast(gray, width, height, tracked.ellipse).contrast >= 8
    )
      return tracked
  }
  return null
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
  height: number,
  gray: Uint8Array,
  allowOcclusion: boolean
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
    const boundary = boundaryEvidence(gray, width, height, ellipse)
    // Separated visible arcs and real dark-to-light edges must support reconstruction.
    // A merged eyelid invalidates filled-area ratios, but cannot create missing rim evidence.
    if (sectors.size < 20 || boundary.support < 0.625 || inliers.length < 12)
      return null
    if (
      !allowOcclusion &&
      (fill < 0.75 || fill > 1.15 || inliers.length < points.length * 0.55)
    )
      return null
    const coverage = Math.min(sectors.size / 32, boundary.support)
    const confidence = allowOcclusion
      ? Math.min(0.99, 0.5 + 0.5 * coverage)
      : Math.min(1, fill, sectors.size / 32, 0.5 + 0.5 * boundary.support)
    return {
      ellipse: { ...ellipse, confidence },
      inliers,
      score: confidence + (0.05 * inliers.length) / points.length,
    }
  }
  let best = validEllipse(initial, width, height) ? support(initial) : null
  let seed = 1729
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  // Deterministic, stratified trials cover the contour without relying on one unbroken arc.
  for (let trial = 0; trial < recoveryTrials; trial++) {
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

/** PuReST's area-based intensity estimate, restricted to the previous pupil's neighborhood. */
function trackedThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  previous: Ellipse
): number {
  const histogram = new Uint32Array(256),
    radius = previous.major * 1.5,
    left = Math.max(0, Math.floor(previous.center[0] - radius)),
    right = Math.min(width, Math.ceil(previous.center[0] + radius)),
    top = Math.max(0, Math.floor(previous.center[1] - radius)),
    bottom = Math.min(height, Math.ceil(previous.center[1] + radius)),
    area = Math.min(
      (right - left) * (bottom - top) * 0.4,
      Math.PI * previous.major * previous.minor
    )
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) histogram[gray[y * width + x]]++
  let count = 0
  for (let intensity = 0; intensity < 256; intensity++) {
    count += histogram[intensity]
    if (count >= area) return intensity
  }
  return 255
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
        const index = y * width + x
        inside += gray[index]
        interior[gray[index]]++
        ni++
      } else if (q > 1.15 ** 2 && q < 1.65 ** 2) {
        outside += gray[y * width + x]
        no++
      }
    }
  if (!ni || !no) return { contrast: 0, homogeneity: 0, cutoff: 0 }
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
    cutoff: Math.round((inside / ni + outside / no) / 2),
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
  const manual = options.thresholdMode === "manual"
  const trackedResult = (tracked: PupilCandidate): Detection => {
    const mask =
      options.includePreviewMasks !== false
        ? new Uint8Array(width * height)
        : undefined
    if (mask)
      for (const [x, y] of tracked.refined) {
        const ix = Math.round(x),
          iy = Math.round(y)
        if (ix >= 0 && iy >= 0 && ix < width && iy < height)
          mask[iy * width + ix] = 255
      }
    return {
      ...result,
      shapeObserved: tracked.shapeObserved !== false,
      ellipse: tracked.ellipse,
      seed: tracked.ellipse.center,
      contour: tracked.points,
      refined: tracked.refined,
      selected: 0,
      previews: [
        {
          label: "Tracked rim",
          method: "tracking",
          threshold: pupilContrast(gray, width, height, tracked.ellipse).cutoff,
          score: tracked.ellipse.confidence,
          ...(mask ? { mask } : {}),
        },
      ],
      reason: "Pupil found",
    }
  }
  const recent =
    !manual && options.previous && (options.previousAgeMs ?? 0) <= 150
      ? options.previous
      : null
  if (recent) {
    const tracked = trackPupilRim(
      cv,
      gray,
      width,
      height,
      recent,
      options.trackingAnchor ?? recent
    )
    if (tracked) return trackedResult(tracked)
  }
  const patch = darkestPatch(gray, width, height)
  if (!patch) return result
  result.seed = patch.point
  const cutoff = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
  const otsu = manual ? 0 : otsuThreshold(gray)
  const globalThresholds = manual
    ? [cutoff(thresholdOffset)]
    : [5, 15, 25].map((delta, index) =>
        cutoff(
          Math.max(patch.value + delta, otsu * [0.55, 0.8, 1][index]) +
            thresholdOffset
        )
      )
  const canUseLocalHistory =
    !manual && options.previous && (options.previousAgeMs ?? 0) <= 150
  const estimatedThreshold = canUseLocalHistory
    ? trackedThreshold(gray, width, height, options.previous!) + thresholdOffset
    : null
  const thresholds =
    estimatedThreshold === null
      ? globalThresholds
      : [-6, 0, 6].map((delta) => cutoff(estimatedThreshold + delta))
  const owned: CvOwnedObject[] = []
  const own = <T extends CvOwnedObject>(value: T): T => {
    owned.push(value)
    return value
  }
  try {
    const source = own(new cv.Mat(height, width, cv.CV_8UC1))
    source.data.set(gray)
    result.previews = thresholds.map((threshold, index) => ({
      label: manual ? "Manual" : ["Strict", "Balanced", "Relaxed"][index],
      threshold,
      method: "global",
      score: 0,
    }))

    const mask = own(new cv.Mat(height, width, cv.CV_8UC1)),
      filtered = own(new cv.Mat()),
      contours = own(new cv.MatVector()),
      hierarchy = own(new cv.Mat())
    // A large crop must not imply a large erosion kernel for a tiny pupil.
    const kernelSize = options.previous
      ? Math.min(5, Math.max(1, Math.floor(options.previous.minor * 0.12) | 1))
      : 3
    const kernel = own(
      cv.getStructuringElement(
        cv.MORPH_ELLIPSE,
        new cv.Size(kernelSize, kernelSize)
      )
    )
    const proposals: PupilProposal[] = []
    let bestCandidate: PupilCandidate | null = null
    let irregular = false

    const consider = (
      ellipse: Ellipse,
      index: number,
      points: Point[],
      refined: Point[]
    ) => {
      if (!validEllipse(ellipse, width, height)) return
      // After a brief loss, an eye-sized shadow must not replace a pupil-sized track.
      if (
        !manual &&
        options.trackingAnchor &&
        ellipse.major > options.trackingAnchor.major * 1.6
      )
        return
      const boundary = boundaryEvidence(gray, width, height, ellipse)
      if (boundary.support < 0.55) return
      const appearance = pupilContrast(gray, width, height, ellipse)
      const contrast = Math.max(
        appearance.contrast,
        boundary.contrast * boundary.support
      )
      if (contrast < 8 || appearance.homogeneity < 0.3) return
      const confidence = Math.min(
        ellipse.confidence,
        0.4 + 0.6 * boundary.support
      )
      if (confidence < 0.65) return
      const fitted = { ...ellipse, confidence }
      let score =
        confidence *
        (0.55 + 0.45 * Math.min(1, contrast / 60)) *
        appearance.homogeneity
      const referenceCenter = options.previous?.center ?? options.expectedCenter
      if (referenceCenter) {
        const distance = Math.hypot(
            fitted.center[0] - referenceCenter[0],
            fitted.center[1] - referenceCenter[1]
          ),
          expectedDistance = Math.max(
            options.previous?.major ?? 0,
            Math.min(width, height) * 0.1
          ),
          position = Math.exp(-0.5 * (distance / expectedDistance) ** 2),
          size = options.previous
            ? Math.exp(
                -Math.abs(Math.log(fitted.major / options.previous.major))
              )
            : 1
        // A small preference stabilizes a track, while stronger image evidence can beat it.
        score += 0.12 * position * size
      }
      if (index === options.previousSelected) score += 0.03
      result.previews[index].score = Math.max(
        result.previews[index].score,
        confidence
      )
      if (!bestCandidate || score > bestCandidate.score)
        bestCandidate = { score, index, points, refined, ellipse: fitted }
    }

    const queueRecovery = (proposal: PupilProposal) => {
      const duplicate = proposals.findIndex(
        (other) =>
          Math.hypot(
            other.ellipse.center[0] - proposal.ellipse.center[0],
            other.ellipse.center[1] - proposal.ellipse.center[1]
          ) < 3 &&
          Math.abs(other.ellipse.major - proposal.ellipse.major) < 3 &&
          Math.abs(other.ellipse.minor - proposal.ellipse.minor) < 3
      )
      if (duplicate >= 0) {
        if (proposals[duplicate].quality >= proposal.quality) return
        proposals.splice(duplicate, 1)
      }
      proposals.push(proposal)
      proposals.sort((a, b) => b.quality - a.quality)
      if (proposals.length > 3) proposals.pop()
    }

    const findCandidates = (
      input: InstanceType<CV["Mat"]>,
      index: number,
      edgeBased = false
    ) => {
      cv.findContours(
        input,
        contours,
        hierarchy,
        edgeBased ? cv.RETR_LIST : cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_NONE
      )
      const regions: PupilContourRegion[] = []
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        try {
          const area = cv.contourArea(contour),
            box = cv.boundingRect(contour)
          if (
            contour.rows < 6 ||
            (!edgeBased && area < 20) ||
            area > width * height * 0.9 ||
            (!edgeBased &&
              Math.max(box.width / box.height, box.height / box.width) > 8)
          )
            continue
          let priority = edgeBased
            ? Math.min(box.width, box.height) / Math.max(box.width, box.height)
            : area / (box.width * box.height)
          if (options.previous) {
            const distance = Math.hypot(
              box.x + box.width / 2 - options.previous.center[0],
              box.y + box.height / 2 - options.previous.center[1]
            )
            priority +=
              0.1 * Math.exp(-distance / Math.max(1, options.previous.major))
          }
          regions.push({ index: i, area, priority })
          regions.sort((a, b) => b.priority - a.priority)
          if (regions.length > maxContourCandidates) regions.pop()
        } finally {
          contour.delete()
        }
      }
      for (const region of regions) {
        const contour = contours.get(region.index),
          area = region.area
        try {
          const points: Point[] = [],
            stride = Math.max(1, Math.ceil(contour.rows / maxContourPoints))
          const coordinates = contour.data32S
          for (let j = 0; j < contour.rows; j += stride) {
            const x = coordinates[j * 2],
              y = coordinates[j * 2 + 1]
            // The crop edge is not an observed pupil boundary. Keep the remaining arcs.
            if (x > 1 && y > 1 && x < width - 2 && y < height - 2)
              points.push([x, y])
          }
          if (points.length < 6) continue
          const refined = edgeBased
            ? curvedEdgePoints(points)
            : refineContour(points)
          if (refined.length < 6) continue
          const fitPoints = cv.matFromArray(
            refined.length,
            1,
            cv.CV_32FC2,
            refined.flat()
          )
          let fitted: Ellipse
          try {
            fitted = convertEllipse(cv.fitEllipse(fitPoints))
          } finally {
            fitPoints.delete()
          }
          if (
            !finite([
              ...fitted.center,
              fitted.major,
              fitted.minor,
              fitted.angle,
            ]) ||
            fitted.minor <= 0
          )
            continue
          const tolerance = Math.max(1.5, fitted.minor * 0.06),
            agreement =
              points.filter((p) => edgeError(p, fitted) <= tolerance).length /
              points.length,
            fill = Math.min(1, area / (Math.PI * fitted.major * fitted.minor))
          fitted.confidence = Math.min(fill, agreement)
          const boundary = validEllipse(fitted, width, height)
            ? boundaryEvidence(gray, width, height, fitted)
            : { support: 0, contrast: 0 }
          if (!edgeBased) consider(fitted, index, points, refined)
          if (refined.length >= 12) {
            irregular = true
            queueRecovery({
              index,
              points,
              refined,
              ellipse: fitted,
              area,
              quality:
                boundary.support * 0.6 +
                agreement * 0.2 +
                Math.min(1, refined.length / points.length) * 0.2,
            })
          }
        } finally {
          contour.delete()
        }
      }
    }

    const segment = (index: number) => {
      const maskPixels = mask.data,
        threshold = result.previews[index].threshold
      for (let i = 0; i < gray.length; i++) {
        maskPixels[i] = gray[i] <= threshold ? 255 : 0
      }
      cv.morphologyEx(mask, filtered, cv.MORPH_OPEN, kernel)
      if (options.includePreviewMasks !== false)
        result.previews[index].mask = Uint8Array.from(filtered.data)
      findCandidates(filtered, index)
    }
    for (let index = 0; index < thresholds.length; index++) segment(index)

    const currentBest = (): PupilCandidate | null => bestCandidate
    if (
      estimatedThreshold !== null &&
      (!currentBest() || currentBest()!.ellipse.confidence < 0.82)
    ) {
      result.previews.push({
        label: "Reacquire",
        threshold: globalThresholds[1],
        method: "global",
        score: 0,
      })
      segment(result.previews.length - 1)
    }
    const recoverBestProposal = () => {
      const proposal = proposals.shift()
      if (!proposal) return
      const recovered = recoverPupilRim(
        cv,
        proposal.points,
        proposal.refined,
        proposal.ellipse,
        proposal.area,
        width,
        height,
        gray,
        !manual
      )
      if (recovered)
        consider(recovered, proposal.index, proposal.points, proposal.refined)
    }
    if (!currentBest() || currentBest()!.ellipse.confidence < 0.88)
      recoverBestProposal()

    if (
      recent &&
      (!currentBest() || currentBest()!.ellipse.confidence < 0.72)
    ) {
      const relocated = relocatePupilRim(
        cv,
        gray,
        width,
        height,
        recent,
        options.trackingAnchor ?? recent
      )
      if (relocated) return trackedResult(relocated)
    }

    if (
      !manual &&
      (!currentBest() || currentBest()!.ellipse.confidence < 0.82)
    ) {
      // At most one extra edge pass and one more robust fit; no unbounded threshold search.
      cv.GaussianBlur(source, filtered, new cv.Size(3, 3), 0)
      cv.Canny(filtered, mask, 12, 36, 3, true)
      const index = result.previews.length
      result.previews.push({
        label: "Edge recovery",
        threshold: thresholds[0],
        method: "edges",
        score: 0,
        ...(options.includePreviewMasks !== false
          ? { mask: Uint8Array.from(mask.data) }
          : {}),
      })
      proposals.length = 0
      findCandidates(mask, index, true)
      recoverBestProposal()
    }
    const winner = currentBest()
    if (winner) {
      result.selected = winner.index
      result.contour = winner.points
      result.refined = winner.refined
      result.ellipse = winner.ellipse
      const preview = result.previews[winner.index]
      if (preview.method === "edges") {
        preview.threshold = pupilContrast(
          gray,
          width,
          height,
          winner.ellipse
        ).cutoff
      }
      result.reason =
        winner.ellipse.confidence >= 0.82 ? "Pupil found" : "Pupil fit is weak"
    } else {
      const previous = options.previousSelected
      result.selected =
        previous !== undefined &&
        previous >= 0 &&
        previous < result.previews.length
          ? previous
          : 0
      if (irregular)
        result.reason =
          "Pupil boundary obscured \u00B7 adjust the eye region or lighting"
    }
    return result
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete()
  }
}
