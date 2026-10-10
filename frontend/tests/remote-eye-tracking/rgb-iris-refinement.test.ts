import { expect, test } from "bun:test"
import { refineIrisBoundary } from "../../apps/web/src/features/remote-eye-tracking/rgb-iris-refinement"
import type { IrisBoundaryProposal } from "../../apps/web/src/features/remote-eye-tracking/rgb-iris-refinement.types"
import { irisImage } from "./iris-image-fixture"
import { refineRgbIrisOffsets } from "../../apps/web/src/features/remote-eye-tracking/rgb-iris-features"
import { inspectRgbFace } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import { face } from "./face-fixture"

const proposal: IrisBoundaryProposal = {
  center: [43.8, 31.5],
  radii: [11, 9],
  angle: 0,
  eyelid: [
    [15, 15],
    [70, 15],
    [70, 50],
    [15, 50],
  ],
}

test("pixel boundaries correct a displaced iris landmark without temporal smoothing", () => {
  for (const angle of [-0.5, 0, 0.5]) {
    const fit = refineIrisBoundary(
      irisImage({ angle, noise: 5, glint: true }),
      [0, 0],
      { ...proposal, angle }
    )
    expect(fit).not.toBeNull()
    expect(
      Math.hypot(fit!.center[0] - 42.4, fit!.center[1] - 32.7)
    ).toBeLessThan(0.5)
    expect(fit!.confidence).toBeGreaterThan(0.5)
  }
})

test("an eyelid edge cannot pull the iris center upward", () => {
  const fit = refineIrisBoundary(irisImage({ lid: 28, glint: true }), [0, 0], {
    ...proposal,
    eyelid: [
      [15, 29],
      [70, 29],
      [70, 50],
      [15, 50],
    ],
  })
  expect(fit).not.toBeNull()
  expect(Math.hypot(fit!.center[0] - 42.4, fit!.center[1] - 32.7)).toBeLessThan(
    0.65
  )
})

test("unclear, undersized, off-crop and malformed eyes decline pixel refinement", () => {
  expect(
    refineIrisBoundary(irisImage({ contrast: 3 }), [0, 0], proposal)
  ).toBeNull()
  expect(
    refineIrisBoundary(irisImage(), [0, 0], { ...proposal, radii: [2, 2] })
  ).toBeNull()
  expect(refineIrisBoundary(irisImage(), [100, 100], proposal)).toBeNull()
  expect(
    refineIrisBoundary(irisImage(), [0, 0], { ...proposal, center: [NaN, 32] })
  ).toBeNull()
  expect(
    refineIrisBoundary(irisImage(), [0, 0], {
      ...proposal,
      eyelid: [
        [15, 32],
        [70, 32],
        [70, 34],
        [15, 34],
      ],
    })
  ).toBeNull()
})

test("cropped pixel coordinates produce the same camera-space center", () => {
  const pixels = irisImage()
  const origin = [10, 7] as [number, number]
  const width = 68
  const height = 50
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const start = ((y + origin[1]) * pixels.width + origin[0]) * 4
    data.set(pixels.data.subarray(start, start + width * 4), y * width * 4)
  }
  const full = refineIrisBoundary(pixels, [0, 0], proposal)!
  const cropped = refineIrisBoundary({ width, height, data }, origin, proposal)!
  expect(full).not.toBeNull()
  expect(cropped).toEqual(full)
})

test("refined offsets preserve canthus polarity, original geometry and fallback measurements", () => {
  const geometry = inspectRgbFace(face(), 640, 480)
  if (!geometry.valid) throw new Error(geometry.reason)
  geometry.eyes = [
    { center: proposal.center, radius: 10 },
    { center: [500, 200], radius: 10 },
  ]
  geometry.landmarks[33] = [15, 32]
  geometry.landmarks[133] = [70, 32]
  geometry.landmarks[158] = [55, 15]
  geometry.landmarks[160] = [30, 15]
  geometry.landmarks[144] = [30, 50]
  geometry.landmarks[153] = [55, 50]
  geometry.landmarks[468] = proposal.center
  geometry.landmarks[469] = [54.8, 31.5]
  geometry.landmarks[470] = [43.8, 22.5]
  geometry.landmarks[471] = [32.8, 31.5]
  geometry.landmarks[472] = [43.8, 40.5]
  const original = structuredClone(geometry)
  const refined = refineRgbIrisOffsets(irisImage(), [0, 0], geometry)
  expect(refined.confidence[0]).toBeGreaterThan(0.5)
  expect(refined.offsets[0]).toBeLessThan(geometry.irisOffsets[0])
  expect(refined.offsets[1]).toBeGreaterThan(geometry.irisOffsets[1])
  expect(refined.offsets.slice(2)).toEqual(geometry.irisOffsets.slice(2))
  expect(geometry).toEqual(original)
  expect(refineRgbIrisOffsets(null, [0, 0], geometry).offsets).toEqual(
    geometry.irisOffsets
  )
})

test("localization follows eye movement rather than shrinking it into the seed position", () => {
  let seedError = 0
  let fittedError = 0
  for (let frame = 0; frame < 20; frame++) {
    const center: [number, number] = [
      34 + frame * 0.8,
      32 + 2 * Math.sin(frame * 0.5),
    ]
    const shift: [number, number] = [
      1.5 * Math.sin(frame * 1.9),
      1.2 * Math.cos(frame),
    ]
    const seed: [number, number] = [center[0] + shift[0], center[1] + shift[1]]
    const fit = refineIrisBoundary(
      irisImage({ center, noise: 8, glint: true }),
      [0, 0],
      { ...proposal, center: seed }
    )
    expect(fit).not.toBeNull()
    const error = Math.hypot(
      fit!.center[0] - center[0],
      fit!.center[1] - center[1]
    )
    expect(error).toBeLessThan(0.65)
    fittedError += error ** 2
    seedError += shift[0] ** 2 + shift[1] ** 2
  }
  expect(fittedError).toBeLessThan(seedError * 0.1)
})

test("an isolated glasses-like straight edge is not an iris", () => {
  const pixels = irisImage({ contrast: 0 })
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      const value = x < 44 ? 50 : 215
      const index = (y * pixels.width + x) * 4
      pixels.data[index] =
        pixels.data[index + 1] =
        pixels.data[index + 2] =
          value
    }
  }
  expect(refineIrisBoundary(pixels, [0, 0], proposal)).toBeNull()
})
