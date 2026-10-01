/** Bounded eye-local contrast recovery. No resize, model, or full-frame filtering. */
export function prepareIrEye(
  gray: Uint8Array,
  width: number,
  height: number
): Uint8Array | null {
  if (width < 3 || height < 3 || gray.length !== width * height) return null
  const filtered = new Uint8Array(gray.length),
    histogram = new Uint32Array(256)
  for (let y = 0; y < height; y++) {
    const above = y === 0 ? 1 : y - 1,
      below = y === height - 1 ? height - 2 : y + 1
    for (let x = 0; x < width; x++) {
      const left = x === 0 ? 1 : x - 1,
        right = x === width - 1 ? width - 2 : x + 1
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
      if (count >= gray.length * fraction) return value
    }
    return 255
  }
  const low = quantile(0.02),
    high = quantile(0.98)
  // Do not amplify a flat sensor image into an apparent pupil.
  if (high - low < 8) return null
  const gain = Math.min(4, 220 / (high - low))
  for (let i = 0; i < filtered.length; i++)
    filtered[i] = Math.round(
      Math.max(0, Math.min(255, 16 + (filtered[i] - low) * gain))
    )
  return filtered
}
