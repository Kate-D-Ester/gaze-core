import type { Point } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
import type { RgbPixels } from "../../apps/web/src/features/remote-eye-tracking/rgb-features.types"

// Frozen pre-optimization implementation. Never import production crop helpers here.
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
 * Adapted from WebEyeTrack obtainEyePatch (MIT; see research/WebEyeTrack-NOTICE.md).
 * Preserves floor-to-pixel landmarks, radial [0.4,0.2] padding, 512-square face warp,
 * the rounded 151/195 eye strip and nearest-neighbor 512x128 resize. Backward mapping
 * samples only the final strip instead of allocating/warping the full 512-square face.
 */
export function referenceRgbEyePatch(
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
  const forward = homography(source, destination)
  const backward = homography(destination, source)
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
  const width = 512
  const height = 128
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const warpedY = startY + Math.floor((y * bandHeight) / height)
    for (let x = 0; x < width; x++) {
      const [sx, sy] = applyHomography(backward, [x, warpedY])
      const ix = Math.floor(sx)
      const iy = Math.floor(sy)
      if (
        ix < 0 ||
        iy < 0 ||
        ix >= frame.width ||
        iy >= frame.height ||
        !Number.isFinite(sx + sy)
      ) {
        continue
      }
      const inputIndex = (iy * frame.width + ix) * 4
      const outputIndex = (y * width + x) * 4
      data[outputIndex] = frame.data[inputIndex]
      data[outputIndex + 1] = frame.data[inputIndex + 1]
      data[outputIndex + 2] = frame.data[inputIndex + 2]
      data[outputIndex + 3] = frame.data[inputIndex + 3]
    }
  }
  return { width, height, data }
}
