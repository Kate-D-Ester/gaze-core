import type { GazeMeasurement } from "./scene.types"
export type Heatmap = {
  width: number
  height: number
  weights: Float32Array
  totalDwellMs: number
}
const eligible = (m: GazeMeasurement) =>
  m.valid &&
  !!m.position &&
  m.position.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
export function buildHeatmap(
  measurements: GazeMeasurement[],
  width: number,
  height: number
): Heatmap {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 1000000
  )
    throw new Error("Invalid heatmap dimensions.")
  const weights = new Float32Array(width * height),
    radius = Math.max(1, Math.round(Math.min(width, height) * 0.025)),
    sigma = Math.max(1, radius / 2)
  let totalDwellMs = 0
  for (let i = 0; i < measurements.length - 1; i++) {
    const point = measurements[i],
      next = measurements[i + 1],
      dwell = next.timestamp - point.timestamp
    if (
      !eligible(point) ||
      !eligible(next) ||
      !Number.isFinite(dwell) ||
      dwell <= 0 ||
      dwell > 250
    )
      continue
    const x = Math.min(width - 1, Math.floor(point.position![0] * width)),
      y = Math.min(height - 1, Math.floor(point.position![1] * height))
    const kernel: [number, number][] = []
    let sum = 0
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const px = x + dx,
          py = y + dy
        if (px < 0 || px >= width || py < 0 || py >= height) continue
        const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
        kernel.push([py * width + px, value])
        sum += value
      }
    for (const [index, value] of kernel) weights[index] += (dwell * value) / sum
    totalDwellMs += dwell
  }
  return { width, height, weights, totalDwellMs }
}
export function heatmapCanvas(
  measurements: GazeMeasurement[],
  background: HTMLCanvasElement
): HTMLCanvasElement {
  const width = 320,
    height = Math.max(
      1,
      Math.round((width * background.height) / background.width)
    )
  const map = buildHeatmap(measurements, width, height),
    layer = document.createElement("canvas")
  layer.width = width
  layer.height = height
  const ctx = layer.getContext("2d"),
    canvas = document.createElement("canvas")
  canvas.width = background.width
  canvas.height = background.height
  const output = canvas.getContext("2d")
  if (!ctx || !output)
    throw new Error("Unable to generate a heatmap in this browser.")
  const data = ctx.createImageData(width, height),
    maximum = map.weights.reduce((max, value) => Math.max(max, value), 0)
  for (let i = 0; i < map.weights.length; i++) {
    const v = maximum ? map.weights[i] / maximum : 0,
      j = i * 4
    data.data[j] = Math.round(255 * Math.min(1, v * 2))
    data.data[j + 1] = Math.round(255 * Math.max(0, 1 - Math.abs(v - 0.5) * 2))
    data.data[j + 2] = Math.round(255 * (1 - v))
    data.data[j + 3] = v > 0 ? Math.round(190 * Math.sqrt(v)) : 0
  }
  ctx.putImageData(data, 0, 0)
  output.drawImage(background, 0, 0)
  output.drawImage(layer, 0, 0, canvas.width, canvas.height)
  return canvas
}
