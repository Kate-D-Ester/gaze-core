import { beforeAll, expect, test } from "bun:test"
import { IrEyeTracker } from "../../apps/web/src/features/remote-eye-tracking/ir-eye-tracker"
import { PupilTracker } from "../../apps/web/src/features/eye-tracking/pupil-tracker"
import { loadOpenCv } from "../../apps/web/src/features/eye-tracking/opencv"

let cv: Awaited<ReturnType<typeof loadOpenCv>>["cv"]
beforeAll(async () => {
  cv = (await loadOpenCv()).cv
})
const width = 320,
  height = 240
function pupil(
  cx = 160,
  cy = 120,
  scale = 1,
  angle = 0,
  occluded = false,
  bright = false,
  background = 170,
  intensity = 126
) {
  const gray = new Uint8Array(width * height)
  const c = Math.cos(angle),
    s = Math.sin(angle)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = x - cx,
        dy = y - cy
      const u = (dx * c + dy * s) / scale,
        v = (-dx * s + dy * c) / scale
      let value = (u / 30) ** 2 + (v / 20) ** 2 <= 1 ? intensity : background
      if (occluded && v < 1) value = 12
      gray[y * width + x] = bright ? 255 - value : value
    }
  return gray
}

test("independent head scale and roll remap pupil history while current partial arcs measure its center", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 4; i++) {
    const result = tracker.process(
      pupil(),
      width,
      height,
      0,
      i * 40,
      {},
      { origin: [160, 120], scale: 150, angle: 0 }
    )
    expect(result.pupil).not.toBeNull()
  }
  for (let i = 4; i < 16; i++) {
    const result = tracker.process(
      pupil(172, 125, 1.35, 0.2, true),
      width,
      height,
      0,
      i * 40,
      {},
      { origin: [172, 125], scale: 202.5, angle: 0.2 }
    )
    expect(result.pupil).not.toBeNull()
    expect(Math.abs(result.pupil!.center[0] - 172)).toBeLessThan(2)
    expect(Math.abs(result.pupil!.center[1] - 125)).toBeLessThan(2)
    expect(Math.abs(result.pupil!.major - 40.5)).toBeLessThan(2)
  }
})

test("a blink clears the current pupil and expired memory cannot fabricate an occluded measurement", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 4; i++) tracker.process(pupil(), width, height, 0, i * 40)
  const closed = tracker.process(
    new Uint8Array(width * height).fill(170),
    width,
    height,
    0,
    160
  )
  expect(closed.pupil).toBeNull()
  expect(closed.reference).toBeNull()
  const stale = tracker.process(
    pupil(160, 120, 1, 0, true),
    width,
    height,
    0,
    1200
  )
  expect(stale.pupil).toBeNull()
  expect(stale.reference).toBeNull()
  const fresh = tracker.process(pupil(162, 121), width, height, 0, 1240)
  expect(fresh.pupil).not.toBeNull()
  expect(Math.abs(fresh.pupil!.center[0] - 162)).toBeLessThan(2)
})

test("a fresh contrast reversal reacquires the pupil without reusing the opposite intensity template", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 4; i++) tracker.process(pupil(), width, height, 0, i * 40)
  const bright = tracker.process(
    pupil(165, 120, 1, 0, false, true),
    width,
    height,
    0,
    160
  )
  expect(bright.pupil).not.toBeNull()
  expect(Math.abs(bright.pupil!.major - 30)).toBeLessThan(2)
  expect(Math.abs(bright.pupil!.center[0] - 165)).toBeLessThan(2)
  const partial = tracker.process(
    pupil(166, 120, 1, 0, true, true),
    width,
    height,
    0,
    200
  )
  expect(partial.pupil).not.toBeNull()
  expect(Math.abs(partial.pupil!.center[0] - 166)).toBeLessThan(2)
})

function brightPupilWithDarkIris(pupilX = 70, closedTop = false, iris = 70) {
  const gray = new Uint8Array(140 * 72).fill(180)
  for (let y = 0; y < 72; y++)
    for (let x = 0; x < 140; x++) {
      if ((x - 70) ** 2 + (y - 36) ** 2 <= 22 ** 2) gray[y * 140 + x] = iris
      if ((x - pupilX) ** 2 + (y - 36) ** 2 <= 11 ** 2) gray[y * 140 + x] = 225
      if (closedTop && y < 37) gray[y * 140 + x] = 12
    }
  return gray
}

test("a moving bright pupil beneath a separately dark lid does not collapse into its visible cap", () => {
  const tracker = new IrEyeTracker(cv)
  const options = {
    maxRadius: 24,
    expectedCenter: [70, 36] as [number, number],
  }
  for (let i = 0; i < 4; i++)
    expect(
      tracker.process(brightPupilWithDarkIris(), 140, 72, 0, i * 40, options)
        .pupil
    ).not.toBeNull()
  for (let i = 4; i < 16; i++) {
    const x = 70 + Math.round(3 * Math.sin((i - 4) / 3))
    const result = tracker.process(
      brightPupilWithDarkIris(x, true),
      140,
      72,
      0,
      i * 40,
      options
    )
    expect(result.pupil).not.toBeNull()
    expect(Math.abs(result.pupil!.center[0] - x)).toBeLessThan(1.5)
    expect(Math.abs(result.pupil!.center[1] - 36)).toBeLessThan(1.5)
    expect(Math.abs(result.pupil!.major - 11)).toBeLessThan(1.5)
    expect(Math.abs(result.pupil!.minor - 11)).toBeLessThan(1.5)
  }
})

test.each([
  [0, 126],
  [4, 126],
  [8, 126],
  [4, 145],
  [8, 145],
])(
  "a complete current pupil immediately recovers after simultaneous movement and illumination changes (%s)",
  (movement, intensity) => {
    const tracker = new IrEyeTracker(cv)
    for (let i = 0; i < 12; i++)
      expect(
        tracker.process(pupil(160, 120, 1, 0, i >= 4), width, height, 0, i * 40)
          .pupil
      ).not.toBeNull()
    for (let i = 12; i < 16; i++) {
      const result = tracker.process(
        pupil(160 + movement, 120, 1, 0, false, false, 210, intensity),
        width,
        height,
        0,
        i * 40
      )
      expect(result.pupil).not.toBeNull()
      expect(Math.abs(result.pupil!.center[0] - 160 - movement)).toBeLessThan(
        1.5
      )
      expect(Math.abs(result.pupil!.major - 30)).toBeLessThan(1.5)
    }
  }
)

test("an independently validated full fit refreshes its glare ceiling from current pixels", () => {
  const tracker = new PupilTracker(cv)
  const measure = (x: number, closed: boolean, iris: number, time: number) => {
    const pixels = brightPupilWithDarkIris(x, closed, iris).map(
      (value) => 255 - value
    )
    return tracker.accept(
      tracker.detect(pixels, 140, 72, 0, time, { includePreviewMasks: false }),
      time,
      140,
      72
    )
  }
  for (let i = 0; i < 12; i++)
    expect(measure(70, i >= 4, 70, i * 40).ellipse).not.toBeNull()
  const fresh = measure(78, false, 125, 480)
  expect(fresh.ellipse).not.toBeNull()
  expect(fresh.shapeObserved).not.toBe(false)
  expect(fresh.strongEvidence).toBe(true)
  expect(fresh.previews[fresh.selected]?.method).toBe("global")
  expect(fresh.pupilReflectionLimit).toBeGreaterThan(125)
  expect(fresh.pupilReflectionLimit).toBeLessThan(200)
})

function faintEye(cx: number, visible = true) {
  const width = 96,
    height = 48,
    gray = new Uint8Array(width * height)
  let random = 17
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const noise = (random % 5) - 2
      const inside = visible && ((x - cx) / 8) ** 2 + ((y - 23) / 6) ** 2 <= 1
      gray[y * width + x] =
        145 + Math.round(x * 0.04) + noise - (inside ? 7 : 0)
    }
  return gray
}
const opening = [
  [14, 23],
  [28, 12],
  [67, 12],
  [82, 23],
  [67, 34],
  [28, 34],
] as [number, number][]
test("automatic full-face IR tracks a faint moving pupil without a manual cutoff", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 12; i++) {
    const x = 43 + i
    const result = tracker.process(faintEye(x), 96, 48, 0, i * 40, {
      centerRegion: opening,
      expectedCenter: [48, 23],
      centerRadius: 26,
      maxRadius: 12,
    })
    expect(result.pupil).not.toBeNull()
    expect(
      Math.hypot(result.pupil!.center[0] - x, result.pupil!.center[1] - 23)
    ).toBeLessThan(2)
  }
  expect(
    tracker.process(faintEye(43, false), 96, 48, 0, 480, {
      centerRegion: opening,
      maxRadius: 12,
    }).pupil
  ).toBeNull()
})

test("native full-face evidence remains unchanged when enhancement is available", () => {
  const native = new IrEyeTracker(cv),
    automatic = new IrEyeTracker(cv)
  const frame = pupil()
  const plain = native.process(frame, width, height, 0, 0)
  const bounded = automatic.process(frame, width, height, 0, 0, {
    centerRegion: [
      [50, 50],
      [270, 50],
      [270, 200],
      [50, 200],
    ],
  })
  expect(bounded.pupil).toEqual(plain.pupil)
})

test("a brighter scleral patch cannot hide a faint dark pupil in a full-face eye", () => {
  const gray = faintEye(43)
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 96; x++)
      if (((x - 70) / 8) ** 2 + ((y - 23) / 6) ** 2 <= 1) gray[y * 96 + x] = 190
  const tracker = new IrEyeTracker(cv)
  const result = tracker.process(gray, 96, 48, 0, 0, {
    centerRegion: opening,
    expectedCenter: [48, 23],
    centerRadius: 30,
    maxRadius: 12,
  })
  expect(result.pupil).not.toBeNull()
  expect(
    Math.hypot(result.pupil!.center[0] - 43, result.pupil!.center[1] - 23)
  ).toBeLessThan(2)
})

test.each([
  [60, 180, 126],
  [150, 190, 165],
  [150, 180, 160],
])(
  "a remote shadow cannot veto a locally supported full-face pupil (%s)",
  (shadow, background, intensity) => {
    const gray = new Uint8Array(96 * 48)
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 96; x++)
        gray[y * 96 + x] =
          x < 42
            ? shadow
            : ((x - 63) / 8) ** 2 + ((y - 23) / 6) ** 2 <= 1
              ? intensity
              : background
    const tracker = new IrEyeTracker(cv)
    const result = tracker.process(gray, 96, 48, 0, 0, {
      centerRegion: opening,
      expectedCenter: [48, 23],
      centerRadius: 30,
      maxRadius: 12,
    })
    expect(result.pupil).not.toBeNull()
    expect(
      Math.hypot(result.pupil!.center[0] - 63, result.pupil!.center[1] - 23)
    ).toBeLessThan(2)
  }
)

test.each([3, 5, 7])(
  "full-face IR follows a small pupil through local illumination and glare (%s)",
  (contrast) => {
    const tracker = new IrEyeTracker(cv)
    for (let i = 0; i < 12; i++) {
      const x = 43 + i,
        gray = new Uint8Array(96 * 48)
      let random = 17
      for (let y = 0; y < 48; y++)
        for (let px = 0; px < 96; px++) {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0
          const inside = ((px - x) / 7) ** 2 + ((y - 23) / 5) ** 2 <= 1
          gray[y * 96 + px] = Math.round(
            125 +
              px * 0.25 +
              y * 0.1 +
              (random % 5) -
              2 -
              (inside ? contrast : 0)
          )
          if ((px - x - 2) ** 2 + (y - 24) ** 2 <= 2) gray[y * 96 + px] = 230
        }
      const result = tracker.process(gray, 96, 48, 0, i * 40, {
        centerRegion: opening,
        expectedCenter: [48, 23],
        centerRadius: 30,
        maxRadius: 12,
      })
      expect(result.pupil).not.toBeNull()
      expect(
        Math.hypot(result.pupil!.center[0] - x, result.pupil!.center[1] - 23)
      ).toBeLessThan(2)
      expect(result.pupil!.major).toBeGreaterThan(5)
      expect(result.pupil!.major).toBeLessThan(9)
    }
  }
)

test.each([3, 5, 8])(
  "local illumination recovery cannot turn isolated glare into a pupil (%s)",
  (radius) => {
    const tracker = new IrEyeTracker(cv)
    for (let i = 0; i < 12; i++) {
      const gray = new Uint8Array(96 * 48),
        x = 43 + i
      let random = 17
      for (let y = 0; y < 48; y++)
        for (let px = 0; px < 96; px++) {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0
          gray[y * 96 + px] = Math.round(
            125 + px * 0.25 + y * 0.1 + (random % 5) - 2
          )
          if ((px - x - 2) ** 2 + (y - 24) ** 2 <= radius ** 2)
            gray[y * 96 + px] = 230
        }
      expect(
        tracker.process(gray, 96, 48, 0, i * 40, {
          centerRegion: opening,
          expectedCenter: [48, 23],
          centerRadius: 30,
          maxRadius: 12,
        }).pupil
      ).toBeNull()
    }
  }
)

function slopedEye(
  slope: number,
  visible: boolean,
  glareRadius: number,
  noiseRange = 5,
  seed = 17,
  verticalSlope = 0.1
) {
  const gray = new Uint8Array(96 * 48)
  let random = seed
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 96; x++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const inside = visible && ((x - 48) / 7) ** 2 + ((y - 23) / 5) ** 2 <= 1
      gray[y * 96 + x] = Math.round(
        135 +
          slope * (x - 48) +
          verticalSlope * (y - 23) +
          (random % noiseRange) -
          Math.floor(noiseRange / 2) -
          (inside ? 5 : 0)
      )
      if (glareRadius > 0 && (x - 50) ** 2 + (y - 24) ** 2 <= glareRadius ** 2)
        gray[y * 96 + x] = 230
    }
  return gray
}
const slopedOptions = {
  centerRegion: opening,
  expectedCenter: [48, 23] as [number, number],
  centerRadius: 30,
  maxRadius: 12,
}
test("illumination slope cannot maintain pupil history after the pupil disappears", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 8; i++)
    expect(
      tracker.process(
        slopedEye(0.6, true, Math.SQRT2),
        96,
        48,
        0,
        i * 40,
        slopedOptions
      ).pupil
    ).not.toBeNull()
  for (let i = 8; i < 12; i++)
    expect(
      tracker.process(
        slopedEye(0.6, false, 0),
        96,
        48,
        0,
        i * 40,
        slopedOptions
      ).pupil
    ).toBeNull()
})
test("a steep illumination slope and isolated glare cannot establish a pupil", () => {
  expect(
    new IrEyeTracker(cv).process(
      slopedEye(1, false, 5),
      96,
      48,
      0,
      0,
      slopedOptions
    ).pupil
  ).toBeNull()
})
test("invalid fractional crop dimensions fail without allocating a recovery image", () => {
  expect(
    new IrEyeTracker(cv).process(
      new Uint8Array(4632),
      96.5,
      48,
      0,
      0,
      slopedOptions
    ).pupil
  ).toBeNull()
})

test.each([0, 0.25])(
  "noise cannot maintain a disappeared pupil (slope%s)",
  (slope) => {
    const tracker = new IrEyeTracker(cv)
    for (let i = 0; i < 8; i++)
      expect(
        tracker.process(
          slopedEye(slope, true, 1.4, 11),
          96,
          48,
          0,
          i * 40,
          slopedOptions
        ).pupil
      ).not.toBeNull()
    for (let i = 8; i < 16; i++)
      expect(
        tracker.process(
          slopedEye(slope, false, 0, 11),
          96,
          48,
          0,
          i * 40,
          slopedOptions
        ).pupil
      ).toBeNull()
  }
)
test("noisy flat pixels and a compact glint cannot cold acquire a pupil", () => {
  expect(
    new IrEyeTracker(cv).process(
      slopedEye(0, false, 1.4, 11),
      96,
      48,
      0,
      0,
      slopedOptions
    ).pupil
  ).toBeNull()
})
test("remaining glare cannot sustain a pupil after it disappears", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 8; i++)
    expect(
      tracker.process(
        slopedEye(0.6, true, 1.4),
        96,
        48,
        0,
        i * 40,
        slopedOptions
      ).pupil
    ).not.toBeNull()
  for (let i = 8; i < 12; i++)
    expect(
      tracker.process(
        slopedEye(0.6, false, 8),
        96,
        48,
        0,
        i * 40,
        slopedOptions
      ).pupil
    ).toBeNull()
})

test("a brighter distant reflection cannot hide broad local glare", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 8; i++)
    expect(
      tracker.process(
        slopedEye(0.6, true, 1.4),
        96,
        48,
        0,
        i * 40,
        slopedOptions
      ).pupil
    ).not.toBeNull()
  const gray = slopedEye(0.6, false, 8)
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 96; x++) {
      if ((x - 50) ** 2 + (y - 24) ** 2 <= 64) gray[y * 96 + x] = 190
      if ((x - 71) ** 2 + (y - 24) ** 2 <= 2) gray[y * 96 + x] = 255
    }
  expect(tracker.process(gray, 96, 48, 0, 320, slopedOptions).pupil).toBeNull()
})

test("global enhancement cannot maintain a pupil using noisy vertical lighting and remaining glare", () => {
  const tracker = new IrEyeTracker(cv)
  for (let i = 0; i < 8; i++)
    expect(
      tracker.process(
        slopedEye(0, true, 1.4, 11, 123, 0.6),
        96,
        48,
        0,
        i * 40,
        slopedOptions
      ).pupil
    ).not.toBeNull()
  expect(
    tracker.process(
      slopedEye(0, false, 5, 11, 123, 0.6),
      96,
      48,
      0,
      320,
      slopedOptions
    ).pupil
  ).toBeNull()
})
