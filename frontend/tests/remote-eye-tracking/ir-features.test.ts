import { beforeAll, expect, test } from "bun:test"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"
import {
  buildIrFeatures,
  detectIrEye,
  type IrReference,
  type IrEyeOptions,
} from "../../apps/web/src/features/remote-eye-tracking/ir-features"
import type { Point } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

let cv: Awaited<ReturnType<typeof loadOpenCv>>["cv"]
beforeAll(async () => {
  cv = (await loadOpenCv()).cv
})
const width = 320,
  height = 240
function eye(
  pupil: Point = [160, 120],
  glint: Point | null = [154, 114],
  scale = 1,
  glintRadius = 3
) {
  const data = new Uint8Array(width * height).fill(175)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (
        (x - pupil[0]) ** 2 / (30 * scale) ** 2 +
          (y - pupil[1]) ** 2 / (23 * scale) ** 2 <=
        1
      )
        data[y * width + x] = 25
      if (
        glint &&
        (x - glint[0]) ** 2 + (y - glint[1]) ** 2 <= (glintRadius * scale) ** 2
      )
        data[y * width + x] = 252
    }
  return data
}
function measure(
  data: Uint8Array,
  timestamp = 0,
  reference: IrReference | null = null,
  threshold = 0,
  options: IrEyeOptions = {}
) {
  return detectIrEye(
    cv,
    data,
    width,
    height,
    threshold,
    timestamp,
    reference,
    options
  )
}
function features(data: Uint8Array) {
  const result = measure(data)
  expect(result.pupil).not.toBeNull()
  expect(result.glint).not.toBeNull()
  return buildIrFeatures(result.pupil!, result.glint!, width, height)
}

test("joint pupil/glint translation preserves displacement while updating the observed reference", () => {
  const a = features(eye()),
    b = features(eye([185, 132], [179, 126]))
  expect(a.feature.length).toBeLessThanOrEqual(24)
  expect(b.feature[0]).toBeCloseTo(a.feature[0], 1)
  expect(b.feature[1]).toBeCloseTo(a.feature[1], 1)
  expect(b.pose.x - a.pose.x).toBeCloseTo(25 / 320, 2)
  expect(b.pose.y - a.pose.y).toBeCloseTo(12 / 240, 2)
  expect(b.pose.kind).toBe("eye-reference")
  expect([b.pose.yaw, b.pose.pitch, b.pose.roll]).toEqual([null, null, null])
})

test("apparent distance change preserves scale-normalized displacement and updates pupil scale", () => {
  const a = features(eye()),
    b = features(eye([160, 120], [151, 111], 1.5))
  expect(b.feature[0]).toBeCloseTo(a.feature[0], 1)
  expect(b.feature[1]).toBeCloseTo(a.feature[1], 1)
  expect(b.pose.scale / a.pose.scale).toBeCloseTo(1.5, 1)
})

test("pupil motion with a stationary glint changes gaze features", () => {
  const a = features(eye()),
    b = features(eye([170, 124], [154, 114]))
  expect(b.feature[0] - a.feature[0]).toBeGreaterThan(0.3)
  expect(b.feature[1] - a.feature[1]).toBeGreaterThan(0.1)
  expect(b.pose.x).toBeCloseTo(a.pose.x, 3)
  expect(b.pose.y).toBeCloseTo(a.pose.y, 3)
})

test("a current glint is required even after a successful prior frame", () => {
  const first = measure(eye(), 0)
  expect(first.reference).not.toBeNull()
  const lost = measure(eye([162, 120], null), 40, first.reference)
  expect(lost.pupil).not.toBeNull()
  expect(lost.glint).toBeNull()
  expect(lost.reference).toBeNull()
  expect(lost.quality).toBe(0)
})

test("broad reflections are rejected rather than labeled corneal glints", () => {
  const result = measure(eye([160, 120], [152, 114], 1, 11))
  expect(result.glint).toBeNull()
  expect(result.reference).toBeNull()
})

test("unrelated bright specks away from the pupil cannot supply a reference", () => {
  const result = measure(eye([160, 120], [240, 60]))
  expect(result.glint).toBeNull()
})

test("a closed eye or missing pupil with a bright speck produces no IR reference", () => {
  const data = new Uint8Array(width * height).fill(175)
  for (let y = 108; y <= 112; y++)
    for (let x = 110; x < 210; x++) data[y * width + x] = 25
  for (let y = 117; y <= 123; y++)
    for (let x = 151; x <= 157; x++) data[y * width + x] = 252
  const result = measure(data)
  expect(result.pupil).toBeNull()
  expect(result.glint).toBeNull()
})

test("multiple equally plausible initial reflections require an unambiguous reference", () => {
  const data = eye([160, 120], [154, 114])
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((x - 166) ** 2 + (y - 126) ** 2 <= 3 ** 2) data[y * width + x] = 252
  expect(measure(data).glint).toBeNull()
})

test("recent glint association follows head translation despite a new competing highlight", () => {
  const first = measure(eye(), 0)
  const data = eye([180, 130], [174, 124])
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((x - 187) ** 2 + (y - 137) ** 2 <= 3 ** 2) data[y * width + x] = 252
  const next = measure(data, 40, first.reference)
  expect(next.glint).not.toBeNull()
  expect(next.glint![0]).toBeCloseTo(174, 1)
  expect(next.glint![1]).toBeCloseTo(124, 1)
  expect(measure(data, 700, first.reference).glint).toBeNull()
})

test("the threshold setting is an absolute pupil cutoff, with zero selecting auto", () => {
  expect(measure(eye(), 0, null, 15).pupil).toBeNull()
  expect(measure(eye(), 0, null, 60).glint).not.toBeNull()
  expect(measure(eye()).glint).not.toBeNull()
})

test("invalid image dimensions do not call detection or return stale measurements", () => {
  const result = detectIrEye(cv, new Uint8Array(10), width, height, 0, 40)
  expect(result.pupil).toBeNull()
  expect(result.glint).toBeNull()
  expect(result.reference).toBeNull()
})

function brightEye(glint: Point | null = [154, 114], pupilIntensity = 200) {
  const data = eye([160, 120], glint)
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 25) data[i] = pupilIntensity
    else if (data[i] === 175) data[i] = 55
  }
  return data
}

test("auto polarity measures a bright pupil and its compact reflection in original pixels", () => {
  const result = measure(brightEye())
  expect(result.pupil).not.toBeNull()
  expect(result.pupil!.center[0]).toBeCloseTo(160, 0)
  expect(result.pupil!.center[1]).toBeCloseTo(120, 0)
  expect(Math.abs(result.pupil!.major - 30)).toBeLessThan(1)
  expect(result.glint).not.toBeNull()
  expect(result.glint![0]).toBeCloseTo(154, 1)
  expect(result.glint![1]).toBeCloseTo(114, 1)
  expect(result.reference).not.toBeNull()
  expect(result.quality).toBeGreaterThan(0)
})

test("a bright pupil without a fresh reflection remains observed but cannot form a reference", () => {
  const result = measure(brightEye(null))
  expect(result.pupil).not.toBeNull()
  expect(result.pupil!.confidence).toBeGreaterThanOrEqual(0.82)
  expect(result.glint).toBeNull()
  expect(result.reference).toBeNull()
  expect(result.quality).toBe(0)
})

test("explicit polarity cannot detect a pupil with the opposite rim contrast", () => {
  expect(
    measure(brightEye(), 0, null, 0, { polarity: "dark" }).pupil
  ).toBeNull()
  expect(measure(eye(), 0, null, 0, { polarity: "bright" }).pupil).toBeNull()
})

test("the bright manual cutoff is a minimum intensity on the original image", () => {
  const accepted = measure(brightEye(), 0, null, 190, { polarity: "bright" })
  expect(accepted.pupil).not.toBeNull()
  expect(accepted.glint).not.toBeNull()
  expect(
    measure(brightEye(), 0, null, 215, { polarity: "bright" }).pupil
  ).toBeNull()
})

test("a pupil larger than the anatomical radius bound cannot become an IR measurement", () => {
  const result = measure(eye([160, 120], [151, 111], 1.5), 0, null, 0, {
    maxRadius: 35,
    expectedCenter: [160, 120],
  })
  expect(result.pupil).toBeNull()
  expect(result.glint).toBeNull()
  expect(result.reference).toBeNull()
})

test("the radius bound also rejects an enclosing bright region", () => {
  const result = measure(brightEye(), 0, null, 0, { maxRadius: 20 })
  expect(result.pupil).toBeNull()
  expect(result.reference).toBeNull()
})

test("an expected eye center excludes a pupil outside its bounded neighborhood", () => {
  const result = measure(eye([240, 120], [234, 114]), 0, null, 0, {
    maxRadius: 35,
    expectedCenter: [160, 120],
  })
  expect(result.pupil).toBeNull()
  expect(result.reference).toBeNull()
})

test("a centered bounded pupil remains available without glint evidence", () => {
  const result = measure(brightEye(null), 0, null, 0, {
    maxRadius: 35,
    expectedCenter: [160, 120],
  })
  expect(result.pupil).not.toBeNull()
  expect(result.pupil!.major).toBeLessThanOrEqual(35)
  expect(result.quality).toBe(0)
  expect(result.reference).toBeNull()
})

test("a broad saturated reflection alone is insufficient bright-pupil evidence", () => {
  const data = new Uint8Array(width * height).fill(55)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((x - 160) ** 2 / 14 ** 2 + (y - 120) ** 2 / 11 ** 2 <= 1)
        data[y * width + x] = 252
  const result = measure(data, 0, null, 0, {
    maxRadius: 35,
    expectedCenter: [160, 120],
  })
  expect(result.pupil).toBeNull()
  expect(result.glint).toBeNull()
  expect(result.reference).toBeNull()
})

test("a recent bright pupil keeps its polarity when a separate dark ellipse appears", () => {
  const first = measure(brightEye(), 0)
  expect(first.reference).not.toBeNull()
  const data = brightEye()
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if ((x - 70) ** 2 / 30 ** 2 + (y - 120) ** 2 / 23 ** 2 <= 1)
        data[y * width + x] = 10
      if ((x - 64) ** 2 + (y - 114) ** 2 <= 3 ** 2) data[y * width + x] = 252
    }
  const result = measure(data, 40, first.reference)
  expect(result.pupil).not.toBeNull()
  expect(result.pupil!.center[0]).toBeCloseTo(160, 0)
  expect(result.glint).not.toBeNull()
  expect(result.glint![0]).toBeCloseTo(154, 1)
})

const nestedWidth = 140,
  nestedHeight = 72
function nestedEye(
  irisIntensity = 70,
  pupilX = 70,
  pupilRadius = 11,
  pupilIntensity = 225
) {
  const data = new Uint8Array(nestedWidth * nestedHeight).fill(180)
  for (let y = 0; y < nestedHeight; y++)
    for (let x = 0; x < nestedWidth; x++) {
      if ((x - 70) ** 2 + (y - 36) ** 2 <= 22 ** 2)
        data[y * nestedWidth + x] = irisIntensity
      if ((x - pupilX) ** 2 + (y - 36) ** 2 <= pupilRadius ** 2)
        data[y * nestedWidth + x] = pupilIntensity
    }
  return data
}
function measureNested(data: Uint8Array, previous: IrReference | null = null) {
  return detectIrEye(cv, data, nestedWidth, nestedHeight, 0, 100, previous, {
    maxRadius: 24,
    expectedCenter: [70, 36],
  })
}

test.each([40, 70, 130])(
  "auto polarity selects a bright pupil inside a darker iris of intensity %s",
  (irisIntensity) => {
    const result = measureNested(nestedEye(irisIntensity))
    expect(result.pupil).not.toBeNull()
    expect(Math.abs(result.pupil!.major - 11)).toBeLessThan(1)
    expect(result.pupil!.center[0]).toBeCloseTo(70, 0)
    expect(result.quality).toBe(0)
    expect(result.reference).toBeNull()
  }
)

test.each([66, 74])(
  "the nested bright pupil at x=%s retains its observed displacement from the iris center",
  (pupilX) => {
    const result = measureNested(nestedEye(70, pupilX))
    expect(result.pupil).not.toBeNull()
    expect(Math.abs(result.pupil!.major - 11)).toBeLessThan(1)
    expect(result.pupil!.center[0]).toBeCloseTo(pupilX, 0)
  }
)

test("a recent dark iris reference cannot lock out its freshly observed bright pupil", () => {
  const first = measureNested(nestedEye(70, 65, 2, 252))
  expect(first.reference).not.toBeNull()
  expect(first.reference!.polarity).toBe("dark")
  const result = measureNested(nestedEye(), first.reference)
  expect(result.pupil).not.toBeNull()
  expect(Math.abs(result.pupil!.major - 11)).toBeLessThan(1)
  expect(result.quality).toBe(0)
  expect(result.reference).toBeNull()
})

test("a separate smaller bright iris highlight cannot displace an observed dark pupil", () => {
  const result = measureNested(nestedEye(25, 82, 6))
  expect(result.pupil).not.toBeNull()
  expect(Math.abs(result.pupil!.major - 22)).toBeLessThan(1)
  expect(result.pupil!.center[0]).toBeCloseTo(70, 0)
})

test("a centered compact reflection cannot replace a larger dark pupil", () => {
  const result = measureNested(nestedEye(25, 70, 4))
  expect(result.pupil).not.toBeNull()
  expect(Math.abs(result.pupil!.major - 22)).toBeLessThan(1)
  expect(result.glint).not.toBeNull()
})

test("contrast recovery preserves raw bright-pupil saturation rejection", () => {
  const saturated = brightEye(null, 252)
  const prepared = brightEye(null, 200)
  const result = detectIrEye(
    cv,
    prepared,
    width,
    height,
    0,
    0,
    null,
    { polarity: "bright" },
    undefined,
    saturated
  )
  expect(result.pupil).toBeNull()
  expect(result.reference).toBeNull()
})

test("contrast recovery finds reflections from raw pixels even when enhancement clips them", () => {
  const raw = brightEye()
  const prepared = brightEye(null)
  const result = detectIrEye(
    cv,
    prepared,
    width,
    height,
    0,
    0,
    null,
    { polarity: "bright" },
    undefined,
    raw
  )
  expect(result.pupil).not.toBeNull()
  expect(result.glint).not.toBeNull()
  expect(result.glint![0]).toBeCloseTo(154, 1)
  expect(result.glint![1]).toBeCloseTo(114, 1)
})

test("a full-face bright pupil inside its iris retains its small centered corneal reflection", () => {
  const pixels = nestedEye(70, 70, 11, 200)
  for (let y = 0; y < nestedHeight; y++)
    for (let x = 0; x < nestedWidth; x++)
      if ((x - 72) ** 2 + (y - 34) ** 2 <= 2 ** 2)
        pixels[y * nestedWidth + x] = 252
  const result = detectIrEye(
    cv,
    pixels,
    nestedWidth,
    nestedHeight,
    0,
    0,
    null,
    {
      maxRadius: 14,
      expectedCenter: [70, 36],
      centerRadius: 24,
      centerRegion: [
        [8, 8],
        [132, 8],
        [132, 64],
        [8, 64],
      ],
    }
  )
  expect(result.pupil).not.toBeNull()
  expect(Math.abs(result.pupil!.major - 11)).toBeLessThan(1)
  expect(result.glint).not.toBeNull()
})
