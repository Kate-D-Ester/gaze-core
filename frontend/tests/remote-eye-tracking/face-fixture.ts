import type { RgbFaceResult } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"

export function face(yaw = 0): RgbFaceResult {
  const landmarks = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }))
  const point = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0 }
  }
  point(4, 0.5, 0.5)
  point(10, 0.5, 0.15)
  point(152, 0.5, 0.8)
  point(127, 0.25, 0.45)
  point(356, 0.75, 0.45)
  point(103, 0.28, 0.25)
  point(150, 0.28, 0.7)
  point(332, 0.72, 0.25)
  point(379, 0.72, 0.7)
  point(151, 0.5, 0.35)
  point(195, 0.5, 0.49)
  for (const [start, end, iris, x] of [
    [33, 133, 468, 0.39],
    [362, 263, 473, 0.61],
  ]) {
    point(start, x - 0.04, 0.42)
    point(end, x + 0.04, 0.42)
    point(iris, x, 0.42)
    point(iris + 1, x + 0.008, 0.42)
    point(iris + 2, x, 0.42 - (0.008 * 4) / 3)
    point(iris + 3, x - 0.008, 0.42)
    point(iris + 4, x, 0.42 + (0.008 * 4) / 3)
  }
  for (const [a, b, c, d, x] of [
    [158, 160, 144, 153, 0.39],
    [385, 387, 373, 380, 0.61],
  ]) {
    point(a, x - 0.02, 0.435)
    point(b, x + 0.02, 0.435)
    point(c, x + 0.02, 0.405)
    point(d, x - 0.02, 0.405)
  }
  return {
    faceLandmarks: [landmarks],
    facialTransformationMatrixes: [
      {
        rows: 4,
        columns: 4,
        data: [
          Math.cos(yaw),
          0,
          -Math.sin(yaw),
          0,
          0,
          1,
          0,
          0,
          Math.sin(yaw),
          0,
          Math.cos(yaw),
          0,
          0,
          0,
          0,
          1,
        ],
      },
    ],
    faceBlendshapes: [],
  }
}
