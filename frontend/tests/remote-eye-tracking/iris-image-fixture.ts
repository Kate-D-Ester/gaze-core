import type { RgbPixels } from "../../apps/web/src/features/remote-eye-tracking/rgb-features.types"
import type { IrisImageOptions } from "./iris-image-fixture.types"

/** Analytic soft ellipse rendered independently of the detector, in camera pixels. */
export function irisImage({
  center = [42.4, 32.7],
  radii = [11, 9],
  angle = 0,
  contrast = 130,
  noise = 0,
  glint = false,
  lid = 0,
}: IrisImageOptions = {}): RgbPixels {
  const width = 88
  const height = 64
  const data = new Uint8ClampedArray(width * height * 4)
  let random = 13214
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - center[0]
      const dy = y - center[1]
      const u = Math.cos(angle) * dx + Math.sin(angle) * dy
      const v = -Math.sin(angle) * dx + Math.cos(angle) * dy
      const radius = Math.hypot(u / radii[0], v / radii[1])
      const iris = 1 / (1 + Math.exp((radius - 1) * 35))
      let intensity = 215 - contrast * iris
      if (radius < 0.35) intensity = 20
      if (y < lid) intensity = 85
      if (glint && Math.hypot(dx - 4, dy + 1) < 1.7) intensity = 255
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      intensity += ((random / 4294967296) * 2 - 1) * noise
      const index = (y * width + x) * 4
      data[index] = intensity
      data[index + 1] = intensity
      data[index + 2] = intensity
      data[index + 3] = 255
    }
  }
  return { width, height, data }
}
