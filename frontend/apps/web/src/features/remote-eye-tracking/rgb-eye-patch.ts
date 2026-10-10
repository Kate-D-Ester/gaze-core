import type { Point } from "./remote-eye-tracking.types"
import type { RgbPixels } from "./rgb-features.types"
import type { RgbEyePatchPlan } from "./rgb-eye-patch.types"

const PATCH_WIDTH = 512
const PATCH_HEIGHT = 128

/** Projective transform from four ordered corners; partial pivoting rejects singular crops. */
function homography(source: Point[], destination: Point[]): number[][] {
  const rows: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = source[i]
    const [u, v] = destination[i]
    rows.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v]
    )
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column
    for (let row = column + 1; row < 8; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
        pivot = row
      }
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) {
      throw new Error("Degenerate eye patch homography")
    }
    ;[rows[column], rows[pivot]] = [rows[pivot], rows[column]]
    const denominator = rows[column][column]
    rows[column] = rows[column].map((value) => value / denominator)
    for (let row = 0; row < 8; row++) {
      if (row === column) {
        continue
      }
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
 * Preserve the pretrained floor/padding/rounded-band rules in full-frame coordinates.
 * The inverse denominator is affine over the strip: equal signs at its corners
 * exclude a projective horizon, and coordinate extrema then occur at the corners.
 */
export function createRgbEyePatchPlan(
  frameWidth: number,
  frameHeight: number,
  landmarks: Point[]
): RgbEyePatchPlan {
  if (
    !Number.isSafeInteger(frameWidth) ||
    !Number.isSafeInteger(frameHeight) ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    throw new Error("Invalid eye patch frame dimensions")
  }
  for (const index of [4, 103, 150, 151, 195, 332, 379]) {
    const point = landmarks[index]
    if (!point || !point.every(Number.isFinite)) {
      throw new Error("Invalid eye patch landmarks")
    }
  }
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
  const forward = homography(source, destination)
  const backward = homography(destination, source)
  if (!backward.every((row) => row.every(Number.isFinite))) {
    throw new Error("Invalid eye patch inverse mapping")
  }
  const top = applyHomography(forward, points[151])[1]
  const bottom = applyHomography(forward, points[195])[1]
  const startY = Math.round(top)
  const bandHeight = Math.round(bottom - top)
  if (
    !Number.isFinite(top + bottom) ||
    bandHeight < 2 ||
    startY < 0 ||
    startY + bandHeight > 512
  ) {
    throw new Error("Eye patch is unavailable at this face pose")
  }
  const endY =
    startY + Math.floor(((PATCH_HEIGHT - 1) * bandHeight) / PATCH_HEIGHT)
  const corners: Point[] = [
    [0, startY],
    [PATCH_WIDTH - 1, startY],
    [0, endY],
    [PATCH_WIDTH - 1, endY],
  ]
  let denominatorSign = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of corners) {
    const w = backward[2][0] * x + backward[2][1] * y + backward[2][2]
    const sign = Math.sign(w)
    if (
      !Number.isFinite(w) ||
      Math.abs(w) < 1e-10 ||
      (denominatorSign !== 0 && sign !== denominatorSign)
    ) {
      throw new Error("Eye patch crosses a projective horizon")
    }
    denominatorSign = sign
    const [sx, sy] = applyHomography(backward, [x, y])
    if (!Number.isFinite(sx + sy)) {
      throw new Error("Invalid eye patch source bounds")
    }
    minX = Math.min(minX, sx)
    minY = Math.min(minY, sy)
    maxX = Math.max(maxX, sx)
    maxY = Math.max(maxY, sy)
  }
  // Include a one-pixel margin around the floored extrema for floating-point
  // roundoff. Clipping never changes the original source-coordinate sampling.
  const x = Math.max(0, Math.min(frameWidth, Math.floor(minX) - 1))
  const y = Math.max(0, Math.min(frameHeight, Math.floor(minY) - 1))
  const right = Math.max(0, Math.min(frameWidth, Math.floor(maxX) + 2))
  const bottomEdge = Math.max(0, Math.min(frameHeight, Math.floor(maxY) + 2))
  const sourceRect =
    right > x && bottomEdge > y
      ? { x, y, width: right - x, height: bottomEdge - y }
      : null
  return { frameWidth, frameHeight, backward, startY, bandHeight, sourceRect }
}

/**
 * Sample cropped readback with its ORIGINAL integer full-frame origin.
 * Floor in full-frame coordinates before subtracting that origin; rebasing the
 * homography first can change nearest-neighbor pixels near integer boundaries.
 */
export function sampleRgbEyePatch(
  frame: RgbPixels | null,
  plan: RgbEyePatchPlan,
  sourceOrigin: Point = [0, 0]
): RgbPixels {
  const data = new Uint8ClampedArray(PATCH_WIDTH * PATCH_HEIGHT * 4)
  if (!plan.sourceRect) {
    return { width: PATCH_WIDTH, height: PATCH_HEIGHT, data }
  }
  if (
    !frame ||
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    frame.data.length !== frame.width * frame.height * 4 ||
    sourceOrigin.length !== 2 ||
    !sourceOrigin.every(Number.isSafeInteger)
  ) {
    throw new Error("Invalid eye patch pixel readback")
  }
  const [originX, originY] = sourceOrigin
  const rect = plan.sourceRect
  if (
    originX > rect.x ||
    originY > rect.y ||
    originX + frame.width < rect.x + rect.width ||
    originY + frame.height < rect.y + rect.height
  ) {
    throw new Error("Eye patch readback does not cover the source rectangle")
  }
  const [[a, b, c], [d, e, f], [g, h, i]] = plan.backward
  for (let y = 0; y < PATCH_HEIGHT; y++) {
    const warpedY =
      plan.startY + Math.floor((y * plan.bandHeight) / PATCH_HEIGHT)
    for (let x = 0; x < PATCH_WIDTH; x++) {
      // Retain the reference multiplication/addition order. Do not regroup.
      const w = g * x + h * warpedY + i
      const sx = (a * x + b * warpedY + c) / w
      const sy = (d * x + e * warpedY + f) / w
      const ix = Math.floor(sx)
      const iy = Math.floor(sy)
      if (
        ix < 0 ||
        iy < 0 ||
        ix >= plan.frameWidth ||
        iy >= plan.frameHeight ||
        !Number.isFinite(sx + sy)
      ) {
        continue
      }
      const inputIndex = ((iy - originY) * frame.width + ix - originX) * 4
      const outputIndex = (y * PATCH_WIDTH + x) * 4
      data[outputIndex] = frame.data[inputIndex]
      data[outputIndex + 1] = frame.data[inputIndex + 1]
      data[outputIndex + 2] = frame.data[inputIndex + 2]
      data[outputIndex + 3] = frame.data[inputIndex + 3]
    }
  }
  return { width: PATCH_WIDTH, height: PATCH_HEIGHT, data }
}
