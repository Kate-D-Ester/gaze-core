import { afterAll, beforeAll, expect, test } from "bun:test"
import { createIrProcessor } from "../../apps/web/src/features/remote-eye-tracking/ir-processor"
import { face } from "./face-fixture"
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
  const processor = await createIrProcessor({ faceLocator: null })
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
  const processor = await createIrProcessor({ faceLocator: null })
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
  const processor = await createIrProcessor({ faceLocator: null })
  const invalid = await processor.process(bitmap(), 100, {
    ...settings,
    roi: { ...settings.roi, width: 0 },
  })
  expect(invalid.feature).toBeNull()
  expect(invalid.quality).toBe(0)
  processor.dispose()
  expect((await processor.process(bitmap(), 140, settings)).feature).toBeNull()
})

function fullFaceFrame(pupils = true, bright = false): ImageBitmap {
  const width = 1920,
    height = 1440,
    pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = bright ? 70 : 175
      for (const cx of [749, 1171]) {
        if (pupils && (x - cx) ** 2 / 11 ** 2 + (y - 605) ** 2 / 9 ** 2 <= 1)
          value = bright ? 235 : 25
      }
      const index = (y * width + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value
      pixels[index + 3] = 255
    }
  return { width, height, pixels } as Pixels
}
const automaticSettings: RemoteSettings = {
  roi: { x: 0, y: 0, width: 1, height: 1 },
  threshold: 0,
}
function locator(result = face()) {
  return {
    detect: (_frame: ImageBitmap, _timestamp: number) => result,
    dispose: () => {},
  }
}
test("automatic full-face IR finds real small pupils without glints at source resolution", async () => {
  const processor = await createIrProcessor({ faceLocator: locator() })
  try {
    const result = await processor.process(
      fullFaceFrame(),
      100,
      automaticSettings
    )
    expect(result.feature).not.toBeNull()
    expect(result.eyes).toHaveLength(2)
    expect(result.eyes[0].center[0]).toBeCloseTo(749, 0)
    expect(result.eyes[1].center[0]).toBeCloseTo(1171, 0)
    expect(result.pose?.kind).toBe("face")
    expect(result.quality).toBeGreaterThan(0.45)
    expect(result.glints).toEqual([])
    expect(result.eyeRegions).toHaveLength(2)
  } finally {
    processor.dispose()
  }
})
test("full-face pupil loss cannot fall back to inferred iris centers or old gaze", async () => {
  const processor = await createIrProcessor({ faceLocator: locator() })
  try {
    expect(
      (await processor.process(fullFaceFrame(), 100, automaticSettings)).feature
    ).not.toBeNull()
    const missing = await processor.process(
      fullFaceFrame(false),
      140,
      automaticSettings
    )
    expect(missing.feature).toBeNull()
    expect(missing.basePoint).toBeNull()
    expect(missing.eyes).toHaveLength(0)
  } finally {
    processor.dispose()
  }
})
test("full-face IR accepts bright pupils with automatic thresholding", async () => {
  const processor = await createIrProcessor({ faceLocator: locator() })
  try {
    const result = await processor.process(
      fullFaceFrame(true, true),
      100,
      automaticSettings
    )
    expect(result.feature).not.toBeNull()
    expect(result.eyes[0].center[0]).toBeCloseTo(749, 0)
    expect(result.pose?.kind).toBe("face")
  } finally {
    processor.dispose()
  }
})
test("missing reflections preserve the detected close-up pupil for setup feedback", async () => {
  const processor = await createIrProcessor({ faceLocator: null })
  try {
    const result = await processor.process(bitmap(false), 100, settings)
    expect(result.feature).toBeNull()
    expect(result.eyes).toHaveLength(1)
    expect(result.eyes[0].center[0]).toBeCloseTo(390, 0)
    expect(result.reason).toContain("reflection")
  } finally {
    processor.dispose()
  }
})

test("IR face localization does not require the RGB model's iris estimate", async () => {
  const landmarks = face()
  for (let i = 468; i < 478; i++) landmarks.faceLandmarks[0][i].x = 2
  const processor = await createIrProcessor({ faceLocator: locator(landmarks) })
  try {
    const result = await processor.process(
      fullFaceFrame(),
      100,
      automaticSettings
    )
    expect(result.feature).not.toBeNull()
    expect(result.eyes[0].center[0]).toBeCloseTo(749, 0)
  } finally {
    processor.dispose()
  }
})

function movingEye(
  cx: number,
  cy: number,
  occluded = false,
  bright = false,
  lidIntensity = 12
): ImageBitmap {
  const width = 320,
    height = 240
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = ((x - cx) / 30) ** 2 + ((y - cy) / 20) ** 2 <= 1 ? 126 : 170
      if (occluded && y < cy + 1) value = lidIntensity
      if (bright) value = 255 - value
      const index = (y * width + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value
      pixels[index + 3] = 255
    }
  return { width, height, pixels } as Pixels
}

test.each([false, true])(
  "IR keeps measuring an occluded moving pupil without glints (bright=%s)",
  async (bright) => {
    const processor = await createIrProcessor({ faceLocator: null })
    try {
      for (let i = 0; i < 4; i++) {
        const result = await processor.process(
          movingEye(160, 120, false, bright),
          i * 40,
          automaticSettings
        )
        expect(result.eyes).toHaveLength(1)
      }
      for (let i = 4; i < 24; i++) {
        const cx = 160 + Math.round(8 * Math.sin(i / 8))
        const cy = 120 + Math.round(4 * Math.cos(i / 8))
        const result = await processor.process(
          movingEye(cx, cy, true, bright),
          i * 40,
          automaticSettings
        )
        expect(result.eyes).toHaveLength(1)
        expect(Math.abs(result.eyes[0].center[0] - cx)).toBeLessThan(2)
        expect(Math.abs(result.eyes[0].center[1] - cy)).toBeLessThan(2)
        expect(result.eyes[0].radius).toBeGreaterThan(27)
        expect(result.feature).toBeNull()
      }
      const blank = movingEye(160, 120) as Pixels
      blank.pixels.fill(170)
      const lost = await processor.process(blank, 1000, automaticSettings)
      expect(lost.eyes).toHaveLength(0)
      expect(lost.feature).toBeNull()
      const recovered = await processor.process(
        movingEye(164, 121, false, bright),
        1040,
        automaticSettings
      )
      expect(recovered.eyes).toHaveLength(1)
      expect(Math.abs(recovered.eyes[0].center[0] - 164)).toBeLessThan(2)
    } finally {
      processor.dispose()
    }
  }
)

function partialFaceFrame(dx = 0, dy = 0, occluded = false): ImageBitmap {
  const width = 1920,
    height = 1440
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = 170
      for (const cx of [749 + dx, 1171 + dx]) {
        if (((x - cx) / 15) ** 2 + ((y - 605 - dy) / 11) ** 2 <= 1) value = 126
        if (occluded && Math.abs(x - cx) < 55 && y > 570 + dy && y < 606 + dy)
          value = 12
      }
      const index = (y * width + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value
      pixels[index + 3] = 255
    }
  return { width, height, pixels } as Pixels
}

test("full-face IR tracks both partially occluded pupils independently without reflections", async () => {
  const processor = await createIrProcessor({ faceLocator: locator() })
  try {
    for (let i = 0; i < 4; i++) {
      const result = await processor.process(
        partialFaceFrame(),
        i * 40,
        automaticSettings
      )
      expect(result.feature).not.toBeNull()
    }
    for (let i = 4; i < 12; i++) {
      const dx = Math.round(4 * Math.sin(i / 4)),
        dy = Math.round(2 * Math.cos(i / 4))
      const result = await processor.process(
        partialFaceFrame(dx, dy, true),
        i * 40,
        automaticSettings
      )
      expect(result.feature).not.toBeNull()
      expect(result.eyes).toHaveLength(2)
      expect(Math.abs(result.eyes[0].center[0] - 749 - dx)).toBeLessThan(2)
      expect(Math.abs(result.eyes[1].center[0] - 1171 - dx)).toBeLessThan(2)
      expect(result.glints).toEqual([])
    }
  } finally {
    processor.dispose()
  }
})

test("a saturated eyelid does not erase the fresh tracked bright-pupil arcs", async () => {
  const processor = await createIrProcessor({ faceLocator: null })
  try {
    for (let i = 0; i < 4; i++)
      await processor.process(
        movingEye(160, 120, false, true),
        i * 40,
        automaticSettings
      )
    const result = await processor.process(
      movingEye(160, 120, true, true, 0),
      160,
      automaticSettings
    )
    expect(result.eyes).toHaveLength(1)
    expect(Math.abs(result.eyes[0].center[0] - 160)).toBeLessThan(2)
    expect(Math.abs(result.eyes[0].center[1] - 120)).toBeLessThan(2)
  } finally {
    processor.dispose()
  }
})

test("IR measures pupils in a partially open eye despite the RGB blink classifier", async () => {
  const result = face()
  for (const index of [158, 160, 385, 387])
    result.faceLandmarks[0][index].y = 0.426
  for (const index of [144, 153, 373, 380])
    result.faceLandmarks[0][index].y = 0.414
  result.faceBlendshapes = [
    { categories: [{ categoryName: "eyeBlinkLeft", score: 0.7 }] },
  ]
  const processor = await createIrProcessor({ faceLocator: locator(result) })
  try {
    const observation = await processor.process(
      fullFaceFrame(),
      100,
      automaticSettings
    )
    expect(observation.feature).not.toBeNull()
    expect(observation.eyes).toHaveLength(2)
    expect(observation.pose?.kind).toBe("face")
  } finally {
    processor.dispose()
  }
})

test("an actually closed IR eye still clears pupil features", async () => {
  const result = face()
  for (const index of [158, 160, 144, 153, 385, 387, 373, 380])
    result.faceLandmarks[0][index].y = 0.42
  const processor = await createIrProcessor({ faceLocator: locator(result) })
  try {
    const observation = await processor.process(
      fullFaceFrame(),
      100,
      automaticSettings
    )
    expect(observation.feature).toBeNull()
    expect(observation.eyes).toHaveLength(0)
  } finally {
    processor.dispose()
  }
})

test("an eye-corner texture patch cannot replace a full-face pupil inside valid iris bounds", async () => {
  const processor = await createIrProcessor({ faceLocator: locator() })
  const frame = fullFaceFrame(false) as Pixels
  for (let y = 590; y < 620; y++)
    for (let x = 685; x < 715; x++)
      if (((x - 700) / 9) ** 2 + ((y - 605) / 7) ** 2 <= 1) {
        const index = (y * frame.width + x) * 4
        frame.pixels[index] =
          frame.pixels[index + 1] =
          frame.pixels[index + 2] =
            126
      }
  try {
    const result = await processor.process(frame, 100, automaticSettings)
    expect(result.eyes).toHaveLength(0)
    expect(result.feature).toBeNull()
  } finally {
    processor.dispose()
  }
})
