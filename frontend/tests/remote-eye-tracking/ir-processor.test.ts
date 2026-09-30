import { afterAll, beforeAll, expect, test } from "bun:test"
import { createIrProcessor } from "../../apps/web/src/features/remote-eye-tracking/ir-processor"
import type { RemoteSettings } from "../../apps/web/src/features/remote-eye-tracking/types"

// Bun has no worker canvas. This adapter supplies real cropped pixel data to the real OpenCV processor.
type Pixels = ImageBitmap & { pixels: Uint8ClampedArray }
const nativeCanvas = globalThis.OffscreenCanvas
class PixelCanvas {
  width: number
  height: number
  private image: Uint8ClampedArray = new Uint8ClampedArray()
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  getContext() {
    return {
      drawImage: (
        source: Pixels,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        _dx: number,
        _dy: number,
        dw: number,
        dh: number
      ) => {
        this.image = new Uint8ClampedArray(this.width * this.height * 4)
        for (let y = 0; y < dh; y++)
          for (let x = 0; x < dw; x++) {
            const sourceX = Math.min(
              source.width - 1,
              Math.floor(sx + (x * sw) / dw)
            )
            const sourceY = Math.min(
              source.height - 1,
              Math.floor(sy + (y * sh) / dh)
            )
            const sourceIndex = (sourceY * source.width + sourceX) * 4
            this.image.set(
              source.pixels.subarray(sourceIndex, sourceIndex + 4),
              (y * this.width + x) * 4
            )
          }
      },
      getImageData: () => ({ data: this.image }),
    }
  }
}
beforeAll(() => {
  globalThis.OffscreenCanvas = PixelCanvas as unknown as typeof OffscreenCanvas
})
afterAll(() => {
  globalThis.OffscreenCanvas = nativeCanvas
})
function bitmap(glint = true): ImageBitmap {
  const width = 640,
    height = 480,
    pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = 175
      if ((x - 390) ** 2 / 30 ** 2 + (y - 280) ** 2 / 23 ** 2 <= 1) value = 25
      if (glint && (x - 384) ** 2 + (y - 274) ** 2 <= 3 ** 2) value = 252
      const index = (y * width + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value
      pixels[index + 3] = 255
    }
  return { width, height, pixels } as Pixels
}
const settings: RemoteSettings = {
  roi: { x: 0.45, y: 0.4, width: 0.4, height: 0.4 },
  threshold: 0,
}

test("IR processing converts normalized ROI measurements to original frame coordinates", async () => {
  const processor = await createIrProcessor()
  try {
    const observation = await processor.process(bitmap(), 100, settings)
    expect(observation.feature).not.toBeNull()
    expect(observation.quality).toBeGreaterThan(0.8)
    expect(observation.eyes).toHaveLength(1)
    expect(observation.eyes[0].center[0]).toBeCloseTo(390, 0)
    expect(observation.eyes[0].center[1]).toBeCloseTo(280, 0)
    expect(observation.faceBox).toEqual({
      x: 288,
      y: 192,
      width: 256,
      height: 192,
    })
    expect(observation.pose!.x).toBeCloseTo(0.6, 3)
    expect(observation.pose!.y).toBeCloseTo(274 / 480, 3)
    expect(observation.pose!.yaw).toBeNull()
    expect(observation.width).toBe(640)
    expect(observation.height).toBe(480)
    expect(observation.timestamp).toBe(100)
  } finally {
    processor.dispose()
  }
})

test("an IR frame without its current reflection clears calibrated input immediately", async () => {
  const processor = await createIrProcessor()
  try {
    expect(
      (await processor.process(bitmap(), 100, settings)).feature
    ).not.toBeNull()
    const lost = await processor.process(bitmap(false), 140, settings)
    expect(lost.feature).toBeNull()
    expect(lost.pose).toBeNull()
    expect(lost.basePoint).toBeNull()
    expect(lost.quality).toBe(0)
  } finally {
    processor.dispose()
  }
})

test("invalid ROI and disposed processors return no feature", async () => {
  const processor = await createIrProcessor()
  const invalid = await processor.process(bitmap(), 100, {
    ...settings,
    roi: { ...settings.roi, width: 0 },
  })
  expect(invalid.feature).toBeNull()
  expect(invalid.quality).toBe(0)
  processor.dispose()
  expect((await processor.process(bitmap(), 140, settings)).feature).toBeNull()
})
