import { pointDistance as distance } from "@/lib/tracking-math"
import { createRgbEyePatchPlan, sampleRgbEyePatch } from "./rgb-eye-patch"
import { RGB_EYE_INDICES } from "./rgb-eye-landmarks"
import {
  buildFacePerspectiveFeatures,
  MIN_FACE_SCALE,
} from "./face-perspective"
import type { Point } from "./remote-eye-tracking.types"
import type {
  RgbFaceGeometry,
  RgbFaceInspection,
  RgbFaceInspectionOptions,
  RgbFaceResult,
  RgbPhysicalModel,
  RgbPhysicalPose,
  RgbPixels,
} from "./rgb-features.types"
export type {
  RgbFaceGeometry,
  RgbFaceInspection,
  RgbFaceResult,
  RgbPixels,
} from "./rgb-features.types"
/** Structural subset shared by MediaPipe results and deterministic geometry fixtures. */
export const RGB_FEATURE_COUNT = 29
const reject = (reason: string): RgbFaceInspection => ({ valid: false, reason })
/** No invalid observation carries features or cached landmarks from an earlier frame. */
export function inspectRgbFace(
  result: RgbFaceResult,
  width: number,
  height: number,
  {
    requireIris = true,
    allowPartialEyes = false,
  }: RgbFaceInspectionOptions = {}
): RgbFaceInspection {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) {
    return reject("invalid-frame")
  }
  if (result.faceLandmarks.length === 0) {
    return reject("face-not-found")
  }
  if (result.faceLandmarks.length !== 1) {
    return reject("multiple-faces")
  }
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
  if (blink) {
    return reject("blink")
  }
  const eyes: RgbFaceGeometry["eyes"] = []
  const offsets: number[] = []
  const eyeReferences: Point[] = []
  let quality = 1
  for (const indices of RGB_EYE_INDICES) {
    const a = landmarks[indices.corners[0]]
    const b = landmarks[indices.corners[1]]
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
    if (eyeWidth < 12 || radius < 2) {
      return reject("eyes-too-small")
    }
    const [p1, p2, p3, p4, p5, p6] = indices.lids.map((i) => landmarks[i])
    const ear = (distance(p2, p6) + distance(p3, p5)) / (2 * distance(p1, p4))
    if (!Number.isFinite(ear) || ear < (allowPartialEyes ? 0.08 : 0.2)) {
      return reject("blink")
    }
    const dx = (b[0] - a[0]) / eyeWidth
    const dy = (b[1] - a[1]) / eyeWidth
    const ix = center[0] - (a[0] + b[0]) / 2
    const iy = center[1] - (a[1] + b[1]) / 2
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
  if (scales.some((s) => s < 0.01)) {
    return reject("pose-unavailable")
  }
  const rotation = [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => matrix.data[c * 4 + r] / scales[c])
  )
  const [r0, r1, r2] = rotation
  const determinant =
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
    r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
  if (Math.abs(determinant - 1) > 0.15) {
    return reject("pose-unavailable")
  }
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r2[0])))
  const pitch = Math.atan2(r2[1], r2[2])
  const roll = Math.atan2(r1[0], r0[0])
  // Reject severe foreshortening, for which iris position and appearance patches become unreliable.
  if (Math.abs(yaw) > 1 || Math.abs(pitch) > 0.8) {
    return reject("head-pose-too-extreme")
  }
  const eyeCenter: Point = [
    (eyeReferences[0][0] + eyeReferences[1][0]) / 2,
    (eyeReferences[0][1] + eyeReferences[1][1]) / 2,
  ]
  const scale = distance(eyeReferences[0], eyeReferences[1]) / width
  if (scale < MIN_FACE_SCALE || !Number.isFinite(scale)) {
    return reject("eyes-too-small")
  }
  const facePoints = requireIris ? landmarks : landmarks.slice(0, 468)
  const xs = facePoints.map((p) => p[0])
  const ys = facePoints.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const faceBox = {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  }
  if (faceBox.width <= 0 || faceBox.height <= 0) {
    return reject("invalid-landmarks")
  }
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
  ) {
    return null
  }
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
  if (!basePoint || !basePoint.every(Number.isFinite)) {
    return null
  }
  const perspective = buildFacePerspectiveFeatures({
    pose: geometry.pose,
    offsets: geometry.irisOffsets,
  })
  if (!perspective) {
    return null
  }
  const { yaw, pitch, roll, scale } = geometry.pose
  const gx = basePoint[0] - 0.5
  const gy = basePoint[1] - 0.5
  const x = geometry.pose.x - 0.5
  const y = geometry.pose.y - 0.5
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
  const features = [...common, ...interactions, ...perspective]
  return features.every(Number.isFinite) ? features : null
}
const multiply = (m: number[][], v: number[]) =>
  m.map((row) => row.reduce((sum, value, i) => sum + value * v[i], 0))
const transpose = (m: number[][]) => m[0].map((_, i) => m.map((row) => row[i]))
function eulerMatrix(pitch: number, yaw: number, roll: number): number[][] {
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
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
  previous?: RgbPhysicalModel
): RgbPhysicalPose {
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
  if (!(faceWidthCm > 0 && Number.isFinite(faceWidthCm))) {
    throw new Error("Invalid reconstructed face width")
  }
  const initialDepth =
    previous?.depth && previous.depth > 5 ? previous.depth : 60
  const f = 1 / Math.tan(Math.PI / 6)
  // Analytic inverse of upstream createPerspectiveMatrix at NDC z=-1, w=1.
  const a = (1 + 10000) / (1 - 10000)
  // Analytic inverse of upstream createPerspectiveMatrix at NDC z=-1, w=1.
  const b = 20000 / (1 - 10000)
  // Analytic inverse of upstream createPerspectiveMatrix at NDC z=-1, w=1.
  const homogeneousW = a / b + 1
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
  if (!(span > 0)) {
    throw new Error("Degenerate reconstructed face")
  }
  const normalized = centered.map((p) => p.map((v) => (v / span) * faceWidthCm))
  const legacy = geometry.legacyModelRotation
  const yaw = Math.asin(Math.max(-1, Math.min(1, -legacy[2][0])))
  const pitch = Math.atan2(legacy[2][1], legacy[2][2])
  const roll = Math.atan2(legacy[1][0], legacy[0][0])
  const rotation = eulerMatrix(-pitch, yaw, roll)
  const inverseRotation = transpose(rotation)
  const canonical = normalized.map((p) => multiply(inverseRotation, p))
  const rotated = canonical.map((p) =>
    multiply(rotation, p).map((v) => v / geometry.legacyModelScale)
  )
  const project = (p: number[], translation: number[]) => {
    const z = p[2] + translation[2]
    if (!(z > 0)) {
      throw new Error("Reconstructed face is behind the camera")
    }
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
        const dx = detected[index][0] - p[0]
        const dy = detected[index][1] - p[1]
        const dot = dx * (center[0] - p[0]) + dy * (center[1] - p[1])
        return sum + (dot < 0 ? -1 : 1) * Math.hypot(dx, dy)
      }, 0) / projected.length
    const delta = Math.max(-5, Math.min(5, 0.1 * radial))
    if (Math.abs(delta) < 0.25) {
      break
    }
    const nextDepth = translation[2] + delta
    if (!(nextDepth > 5)) {
      break
    }
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
  const x = Math.cos(-pitch) * Math.sin(yaw)
  // This is a head orientation input to BlazeGaze, not an ocular or optical-axis gaze ray.
  const y = Math.sin(-pitch)
  const headVector: [number, number, number] = [
    Math.cos(roll) * x - Math.sin(roll) * y,
    Math.sin(roll) * x + Math.cos(roll) * y,
    -Math.cos(-pitch) * Math.cos(yaw),
  ]
  if (![...faceOrigin, ...headVector].every(Number.isFinite)) {
    throw new Error("Invalid model geometry")
  }
  return { headVector, faceOrigin, faceWidthCm }
}
/**
 * Adapted from WebEyeTrack obtainEyePatch (MIT; see research/WebEyeTrack-NOTICE.md).
 * Keeps the existing full-frame API while sharing the bounded readback sampler.
 */
export function extractRgbEyePatch(
  frame: RgbPixels,
  landmarks: Point[]
): RgbPixels {
  return sampleRgbEyePatch(
    frame,
    createRgbEyePatchPlan(frame.width, frame.height, landmarks)
  )
}
