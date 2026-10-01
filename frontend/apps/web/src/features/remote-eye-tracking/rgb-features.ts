import type { HeadPose, Point, Rect } from "./types"

/** Structural subset shared by MediaPipe results and deterministic geometry fixtures. */
export type RgbFaceResult = {
  faceLandmarks: { x: number; y: number; z: number }[][]
  facialTransformationMatrixes: {
    rows: number
    columns: number
    data: number[]
  }[]
  faceBlendshapes: { categories: { categoryName: string; score: number }[] }[]
}
export type RgbFaceGeometry = {
  valid: true
  landmarks: Point[]
  normalizedLandmarks: Point[]
  eyes: { center: Point; radius: number }[]
  irisOffsets: [number, number, number, number]
  faceBox: Rect
  pose: HeadPose & { kind: "face"; yaw: number; pitch: number; roll: number }
  rotation: number[][]
  legacyModelRotation: number[][]
  legacyModelScale: number
  quality: number
}
export type RgbFaceInspection =
  | RgbFaceGeometry
  | { valid: false; reason: string }

const EYE_INDICES = [
  { iris: 468, corners: [33, 133], lids: [133, 158, 160, 33, 144, 153] },
  { iris: 473, corners: [362, 263], lids: [362, 385, 387, 263, 373, 380] },
]
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
const reject = (reason: string): RgbFaceInspection => ({ valid: false, reason })

/** No invalid observation carries features or cached landmarks from an earlier frame. */
export function inspectRgbFace(
  result: RgbFaceResult,
  width: number,
  height: number,
  {
    requireIris = true,
    allowPartialEyes = false,
  }: { requireIris?: boolean; allowPartialEyes?: boolean } = {}
): RgbFaceInspection {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height)))
    return reject("invalid-frame")
  if (result.faceLandmarks.length === 0) return reject("face-not-found")
  if (result.faceLandmarks.length !== 1) return reject("multiple-faces")
  const normalized = result.faceLandmarks[0]
  if (
    normalized.length < 478 ||
    normalized
      .slice(0, requireIris ? 478 : 468)
      .some((p) => !Number.isFinite(p.x + p.y + p.z))
  ) {
    return reject("invalid-landmarks")
  }
  const landmarks: Point[] = normalized.map((p) => [p.x * width, p.y * height])
  // The IR pipeline validates visible pupil pixels; RGB blink predictions can
  // reject partially open NIR eyes before their measured rim is examined.
  const blink =
    !allowPartialEyes &&
    result.faceBlendshapes[0]?.categories.some(
      (category) =>
        (category.categoryName === "eyeBlinkLeft" ||
          category.categoryName === "eyeBlinkRight") &&
        category.score > 0.5
    )
  if (blink) return reject("blink")

  const eyes: RgbFaceGeometry["eyes"] = []
  const offsets: number[] = []
  const eyeReferences: Point[] = []
  let quality = 1
  for (const indices of EYE_INDICES) {
    const a = landmarks[indices.corners[0]],
      b = landmarks[indices.corners[1]]
    const center: Point = requireIris
      ? landmarks[indices.iris]
      : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const iris = requireIris
      ? landmarks.slice(indices.iris + 1, indices.iris + 5)
      : []
    if (
      [center, ...iris, a, b].some(
        ([x, y]) => x < 0 || x >= width || y < 0 || y >= height
      )
    ) {
      return reject("eyes-out-of-frame")
    }
    const eyeWidth = distance(a, b)
    const radius = requireIris
      ? iris.reduce((sum, p) => sum + distance(p, center), 0) / 4
      : eyeWidth * 0.12
    if (eyeWidth < 12 || radius < 2) return reject("eyes-too-small")
    const [p1, p2, p3, p4, p5, p6] = indices.lids.map((i) => landmarks[i])
    const ear = (distance(p2, p6) + distance(p3, p5)) / (2 * distance(p1, p4))
    if (!Number.isFinite(ear) || ear < (allowPartialEyes ? 0.08 : 0.2))
      return reject("blink")
    const dx = (b[0] - a[0]) / eyeWidth,
      dy = (b[1] - a[1]) / eyeWidth
    const ix = center[0] - (a[0] + b[0]) / 2,
      iy = center[1] - (a[1] + b[1]) / 2
    offsets.push(
      (ix * dx + iy * dy) / eyeWidth,
      (-ix * dy + iy * dx) / eyeWidth
    )
    eyes.push({ center, radius })
    eyeReferences.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    quality = Math.min(
      quality,
      radius / 4,
      eyeWidth / 30,
      ear / (allowPartialEyes ? 0.15 : 0.3)
    )
  }

  const matrix = result.facialTransformationMatrixes[0]
  if (
    !matrix ||
    matrix.rows !== 4 ||
    matrix.columns !== 4 ||
    matrix.data.length !== 16 ||
    !matrix.data.every(Number.isFinite)
  ) {
    return reject("pose-unavailable")
  }
  // Native MediaPipe MatrixData is column-major (framework/formats/matrix_data.proto).
  // Remove column scale before extracting the reported Rz Ry Rx orientation.
  const scales = [0, 1, 2].map((c) =>
    Math.hypot(
      matrix.data[c * 4],
      matrix.data[c * 4 + 1],
      matrix.data[c * 4 + 2]
    )
  )
  if (scales.some((s) => s < 0.01)) return reject("pose-unavailable")
  const rotation = [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => matrix.data[c * 4 + r] / scales[c])
  )
  const [r0, r1, r2] = rotation
  const determinant =
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
    r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
  if (Math.abs(determinant - 1) > 0.15) return reject("pose-unavailable")
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r2[0])))
  const pitch = Math.atan2(r2[1], r2[2])
  const roll = Math.atan2(r1[0], r0[0])
  // Reject severe foreshortening, for which iris position and appearance patches become unreliable.
  if (Math.abs(yaw) > 1 || Math.abs(pitch) > 0.8)
    return reject("head-pose-too-extreme")
  const eyeCenter: Point = [
    (eyeReferences[0][0] + eyeReferences[1][0]) / 2,
    (eyeReferences[0][1] + eyeReferences[1][1]) / 2,
  ]
  const scale = distance(eyeReferences[0], eyeReferences[1]) / width
  if (scale < 0.025 || !Number.isFinite(scale)) return reject("eyes-too-small")
  const facePoints = requireIris ? landmarks : landmarks.slice(0, 468)
  const xs = facePoints.map((p) => p[0]),
    ys = facePoints.map((p) => p[1])
  const x = Math.min(...xs),
    y = Math.min(...ys)
  const faceBox = {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  }
  if (faceBox.width <= 0 || faceBox.height <= 0)
    return reject("invalid-landmarks")
  return {
    valid: true,
    landmarks,
    normalizedLandmarks: normalized.map((p) => [p.x, p.y]),
    eyes,
    irisOffsets: offsets as RgbFaceGeometry["irisOffsets"],
    faceBox,
    pose: {
      kind: "face",
      yaw,
      pitch,
      roll,
      x: eyeCenter[0] / width,
      y: eyeCenter[1] / height,
      scale,
    },
    rotation,
    // BlazeGaze was trained with the upstream WebEyeTrack row-major interpretation.
    // Preserve that legacy input independently; never report it as native head pose.
    legacyModelRotation: [0, 1, 2].map((r) =>
      [0, 1, 2].map((c) => matrix.data[r * 4 + c])
    ),
    legacyModelScale: [0, 1, 2].reduce(
      (sum, c) =>
        sum +
        Math.hypot(matrix.data[c], matrix.data[4 + c], matrix.data[8 + c]) / 3,
      0
    ),
    quality: Math.max(0, Math.min(1, quality)),
  }
}

/** BlazeGaze predicts centered screen coordinates; preserve out-of-screen predictions for validation. */
export function modelPredictionToScreen(
  prediction: ArrayLike<number>
): Point | null {
  if (
    prediction.length !== 2 ||
    !Number.isFinite(prediction[0] + prediction[1])
  )
    return null
  return [prediction[0] + 0.5, prediction[1] + 0.5]
}

/**
 * Shared pretrained appearance/iris/pose backbone with different camera geometry interactions.
 * Phone: varying handheld distance and roll; laptop: fixed camera with gaze/head-angle coupling.
 * Per-frame translation and scale remain explicit so calibration can mix poses at each target.
 */
export function buildRgbFeatures(
  mode: "mobile" | "webcam",
  geometry: RgbFaceGeometry,
  basePoint: Point | null
): number[] | null {
  if (!basePoint || !basePoint.every(Number.isFinite)) return null
  const { yaw, pitch, roll, scale } = geometry.pose
  if (!(scale > 0)) return null
  const gx = basePoint[0] - 0.5,
    gy = basePoint[1] - 0.5
  const x = geometry.pose.x - 0.5,
    y = geometry.pose.y - 0.5
  const [rx, ry, lx, ly] = geometry.irisOffsets
  const common = [
    gx,
    gy,
    rx,
    ry,
    lx,
    ly,
    yaw,
    pitch,
    roll,
    x,
    y,
    Math.log(scale),
  ]
  const interactions =
    mode === "mobile"
      ? [
          gx / scale,
          gy / scale,
          x / scale,
          y / scale,
          yaw / scale,
          pitch / scale,
          gx * roll,
          gy * roll,
        ]
      : [
          gx * yaw,
          gy * pitch,
          ((rx + lx) * yaw) / 2,
          ((ry + ly) * pitch) / 2,
          yaw * pitch,
          x * yaw,
          y * pitch,
          (roll * (rx + lx)) / 2,
        ]
  const features = [...common, ...interactions]
  return features.every(Number.isFinite) ? features : null
}

const multiply = (m: number[][], v: number[]) =>
  m.map((row) => row.reduce((sum, value, i) => sum + value * v[i], 0))
const transpose = (m: number[][]) => m[0].map((_, i) => m.map((row) => row[i]))
function eulerMatrix(pitch: number, yaw: number, roll: number): number[][] {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cr = Math.cos(roll),
    sr = Math.sin(roll)
  return [
    [cr * cy, cr * sy * sp - sr * cp, cr * sy * cp + sr * sp],
    [sr * cy, sr * sy * sp + cr * cp, sr * sy * cp - cr * sp],
    [-sy, cy * sp, cy * cp],
  ]
}

/**
 * Model-compatible face reconstruction adapted from WebEyeTrack mathUtils.ts (MIT).
 * Assumed 60° projection, fx=fy=image width and 1.2cm iris diameter match upstream.
 * These approximate centimeters are model inputs, not measured camera-to-screen geometry.
 */
export function prepareBlazeGazeGeometry(
  geometry: RgbFaceGeometry,
  width: number,
  height: number,
  previous?: { faceWidthCm: number; depth: number }
): {
  headVector: [number, number, number]
  faceOrigin: [number, number, number]
  faceWidthCm: number
} {
  const points = geometry.landmarks.map(
    ([x, y]) => [Math.floor(x), Math.floor(y)] as Point
  )
  const irisDiameters = [
    distance(points[471], points[469]),
    distance(points[476], points[474]),
  ]
  const faceWidthCm =
    previous?.faceWidthCm ??
    (1.2 * distance(points[356], points[127])) /
      ((irisDiameters[0] + irisDiameters[1]) / 2)
  if (!(faceWidthCm > 0 && Number.isFinite(faceWidthCm)))
    throw new Error("Invalid reconstructed face width")
  const initialDepth =
    previous?.depth && previous.depth > 5 ? previous.depth : 60
  const f = 1 / Math.tan(Math.PI / 6)
  // Analytic inverse of upstream createPerspectiveMatrix at NDC z=-1, w=1.
  const a = (1 + 10000) / (1 - 10000),
    b = 20000 / (1 - 10000),
    homogeneousW = a / b + 1
  const relative = geometry.normalizedLandmarks.map(([u, v]) => [
    (-(2 * u - 1) * (width / height)) / f / homogeneousW,
    (1 - 2 * v) / f / homogeneousW,
    initialDepth,
  ])
  const nose = relative[4]
  const centered = relative.map(([x, y, z]) => [
    -(x - nose[0]),
    -(y - nose[1]),
    z - nose[2],
  ])
  const span = Math.hypot(
    ...centered[356].map((value, index) => value - centered[127][index])
  )
  if (!(span > 0)) throw new Error("Degenerate reconstructed face")
  const normalized = centered.map((p) => p.map((v) => (v / span) * faceWidthCm))
  const legacy = geometry.legacyModelRotation
  const yaw = Math.asin(Math.max(-1, Math.min(1, -legacy[2][0])))
  const pitch = Math.atan2(legacy[2][1], legacy[2][2])
  const roll = Math.atan2(legacy[1][0], legacy[0][0])
  const rotation = eulerMatrix(-pitch, yaw, roll)
  const canonical = normalized.map((p) => multiply(transpose(rotation), p))
  const rotated = canonical.map((p) =>
    multiply(rotation, p).map((v) => v / geometry.legacyModelScale)
  )
  const project = (p: number[], translation: number[]) => {
    const z = p[2] + translation[2]
    if (!(z > 0)) throw new Error("Reconstructed face is behind the camera")
    return [
      Math.round((width * (p[0] + translation[0])) / z + width / 2),
      Math.round((width * (p[1] + translation[1])) / z + height / 2),
    ] as Point
  }
  const detected = geometry.normalizedLandmarks.map(
    ([x, y]) => [x * width, y * height] as Point
  )
  const originProjection = project(rotated[4], [0, 0, initialDepth])
  const initialTranslation = [
    ((detected[4][0] - originProjection[0]) * initialDepth) / width,
    ((detected[4][1] - originProjection[1]) * initialDepth) / width,
    initialDepth,
  ]
  const translation = [...initialTranslation]
  const center = detected.reduce<Point>(
    (acc, p) => [
      acc[0] + p[0] / detected.length,
      acc[1] + p[1] / detected.length,
    ],
    [0, 0]
  )
  for (let iteration = 0; iteration < 10; iteration++) {
    const projected = rotated.map((p) => project(p, translation))
    const radial =
      projected.reduce((sum, p, index) => {
        const dx = detected[index][0] - p[0],
          dy = detected[index][1] - p[1]
        const dot = dx * (center[0] - p[0]) + dy * (center[1] - p[1])
        return sum + (dot < 0 ? -1 : 1) * Math.hypot(dx, dy)
      }, 0) / projected.length
    const delta = Math.max(-5, Math.min(5, 0.1 * radial))
    if (Math.abs(delta) < 0.25) break
    const nextDepth = translation[2] + delta
    if (!(nextDepth > 5)) break
    translation[0] = (initialTranslation[0] * nextDepth) / initialDepth
    translation[1] = (initialTranslation[1] * nextDepth) / initialDepth
    translation[2] = nextDepth
  }
  const faceOrigin: [number, number, number] = [0, 0, 0]
  for (const index of [33, 133, 362, 263]) {
    for (const axis of [0, 1, 2]) {
      faceOrigin[axis] += (rotated[index][axis] + translation[axis]) / 4
    }
  }
  // This is a head orientation input to BlazeGaze, not an ocular or optical-axis gaze ray.
  const x = Math.cos(-pitch) * Math.sin(yaw),
    y = Math.sin(-pitch)
  const headVector: [number, number, number] = [
    Math.cos(roll) * x - Math.sin(roll) * y,
    Math.sin(roll) * x + Math.cos(roll) * y,
    -Math.cos(-pitch) * Math.cos(yaw),
  ]
  if (![...faceOrigin, ...headVector].every(Number.isFinite))
    throw new Error("Invalid model geometry")
  return { headVector, faceOrigin, faceWidthCm }
}

export type RgbPixels = {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Projective transform from four ordered corners; partial pivoting rejects singular crops. */
function homography(source: Point[], destination: Point[]): number[][] {
  const rows: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = source[i],
      [u, v] = destination[i]
    rows.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v]
    )
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column
    for (let row = column + 1; row < 8; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column]))
        pivot = row
    if (Math.abs(rows[pivot][column]) < 1e-10)
      throw new Error("Degenerate eye patch homography")
    ;[rows[column], rows[pivot]] = [rows[pivot], rows[column]]
    const denominator = rows[column][column]
    rows[column] = rows[column].map((value) => value / denominator)
    for (let row = 0; row < 8; row++) {
      if (row === column) continue
      const factor = rows[row][column]
      rows[row] = rows[row].map(
        (value, index) => value - factor * rows[column][index]
      )
    }
  }
  const h = rows.map((row) => row[8])
  return [h.slice(0, 3), h.slice(3, 6), [h[6], h[7], 1]]
}
function applyHomography(h: number[][], [x, y]: Point): Point {
  const w = h[2][0] * x + h[2][1] * y + h[2][2]
  return [
    (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
    (h[1][0] * x + h[1][1] * y + h[1][2]) / w,
  ]
}

/**
 * Adapted from WebEyeTrack obtainEyePatch (MIT; see research/WebEyeTrack-NOTICE.md).
 * Preserves floor-to-pixel landmarks, radial [0.4,0.2] padding, 512-square face warp,
 * the rounded 151/195 eye strip and nearest-neighbor 512x128 resize. Backward mapping
 * samples only the final strip instead of allocating/warping the full 512-square face.
 */
export function extractRgbEyePatch(
  frame: RgbPixels,
  landmarks: Point[]
): RgbPixels {
  const points = landmarks.map(
    ([x, y]) => [Math.floor(x), Math.floor(y)] as Point
  )
  const center = points[4]
  const source: Point[] = [103, 150, 379, 332].map((index) => {
    const [x, y] = points[index]
    return [x + (x - center[0]) * 0.4, y + (y - center[1]) * 0.2]
  })
  const destination: Point[] = [
    [0, 0],
    [0, 512],
    [512, 512],
    [512, 0],
  ]
  const forward = homography(source, destination),
    backward = homography(destination, source)
  const top = applyHomography(forward, points[151])[1]
  const bottom = applyHomography(forward, points[195])[1]
  const startY = Math.round(top),
    bandHeight = Math.round(bottom - top)
  if (
    !Number.isFinite(top + bottom) ||
    bandHeight < 2 ||
    startY < 0 ||
    startY + bandHeight > 512
  ) {
    throw new Error("Eye patch is unavailable at this face pose")
  }
  const width = 512,
    height = 128,
    data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const warpedY = startY + Math.floor((y * bandHeight) / height)
    for (let x = 0; x < width; x++) {
      const [sx, sy] = applyHomography(backward, [x, warpedY])
      const ix = Math.floor(sx),
        iy = Math.floor(sy)
      if (
        ix < 0 ||
        iy < 0 ||
        ix >= frame.width ||
        iy >= frame.height ||
        !Number.isFinite(sx + sy)
      )
        continue
      const inputIndex = (iy * frame.width + ix) * 4,
        outputIndex = (y * width + x) * 4
      data[outputIndex] = frame.data[inputIndex]
      data[outputIndex + 1] = frame.data[inputIndex + 1]
      data[outputIndex + 2] = frame.data[inputIndex + 2]
      data[outputIndex + 3] = frame.data[inputIndex + 3]
    }
  }
  return { width, height, data }
}
