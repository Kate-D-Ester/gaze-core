import type { CV } from "../eye-tracking/opencv.types"
/** Bounded eye-local contrast recovery. No resize, model, or full-frame filtering. */
export function prepareIrEye(
  gray: Uint8Array,
  width: number,
  height: number
): Uint8Array | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 3 ||
    height < 3 ||
    gray.length !== width * height
  ) {
    return null
  }
  const filtered = new Uint8Array(gray.length)
  const histogram = new Uint32Array(256)
  for (let y = 0; y < height; y++) {
    const above = y === 0 ? 1 : y - 1
    const below = y === height - 1 ? height - 2 : y + 1
    for (let x = 0; x < width; x++) {
      const left = x === 0 ? 1 : x - 1
      const right = x === width - 1 ? width - 2 : x + 1
      const value = Math.round(
        (gray[above * width + left] +
          2 * gray[above * width + x] +
          gray[above * width + right] +
          2 * gray[y * width + left] +
          4 * gray[y * width + x] +
          2 * gray[y * width + right] +
          gray[below * width + left] +
          2 * gray[below * width + x] +
          gray[below * width + right]) /
          16
      )
      filtered[y * width + x] = value
      histogram[value]++
    }
  }
  const quantile = (fraction: number) => {
    let count = 0
    for (let value = 0; value < 256; value++) {
      count += histogram[value]
      if (count >= gray.length * fraction) {
        return value
      }
    }
    return 255
  }
  const low = quantile(0.02)
  const high = quantile(0.98)
  // Do not amplify a flat sensor image into an apparent pupil.
  if (high - low < 8) {
    return null
  }
  const gain = Math.min(4, 220 / (high - low))
  for (let i = 0; i < filtered.length; i++) {
    filtered[i] = Math.round(
      Math.max(0, Math.min(255, 16 + (filtered[i] - low) * gain))
    )
  }
  return filtered
}
/** Remove slowly varying illumination before fitting a faint pupil rim. */
export function prepareIrLocalEye(
  cv: CV,
  gray: Uint8Array,
  width: number,
  height: number,
  backgroundFraction = 0.48
): Uint8Array | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 24 ||
    height < 24 ||
    gray.length !== width * height
  ) {
    return null
  }
  const source = new cv.Mat(height, width, cv.CV_8UC1)
  const denoised = new cv.Mat()
  const background = new cv.Mat()
  try {
    source.data.set(gray)
    // Compact positive outliers otherwise create dark halos in the illumination residual.
    // The original pixels remain untouched for actual corneal-reflection measurements.
    cv.medianBlur(source, background, 5)
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] > background.data[i] + 20) {
        source.data[i] = background.data[i]
      }
    }
    cv.GaussianBlur(source, denoised, new cv.Size(3, 3), 0)
    const size = Math.max(7, Math.round(width * backgroundFraction) | 1)
    cv.GaussianBlur(denoised, background, new cv.Size(size, size), size / 6)
    return Uint8Array.from(denoised.data, (value, i) =>
      Math.round(
        Math.max(0, Math.min(255, 128 + (value - background.data[i]) * 8))
      )
    )
  } finally {
    source.delete()
    denoised.delete()
    background.delete()
  }
}
