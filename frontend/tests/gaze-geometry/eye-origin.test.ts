import { expect, test } from "bun:test"
import { estimateEyeOrigin } from "../../research/gaze-3d/browser/eye-origin"
import type { EyeOriginInput } from "../../research/gaze-3d/browser/eye-origin.types"

const input: EyeOriginInput = {
  leftAnchorPixels: [270, 200],
  rightAnchorPixels: [330, 200],
  anchorSpanMetres: [0.06, 0, 0],
  eyeCenterFromAnchorMidpointMetres: [0, 0, 0],
  intrinsics: {
    fx: 600,
    fy: 900,
    cx: 320,
    cy: 240,
    imageWidth: 640,
    imageHeight: 480,
  },
}

test("calibrated focal lengths and measured anchor span recover a metric origin", () => {
  const result = estimateEyeOrigin(input)!
  expect(result.source).toBe("monocular-estimate")
  expect(result.originMetres[0]).toBeCloseTo(-0.02, 12)
  expect(result.originMetres[1]).toBeCloseTo(-0.02666666666666667, 12)
  expect(result.originMetres[2]).toBeCloseTo(0.6, 12)
  expect(result.anchorResidualMetres).toBeLessThan(1e-10)
})

test("unknown physical scale cannot be replaced with an average face size", () => {
  expect(
    estimateEyeOrigin({ ...input, anchorSpanMetres: [0, 0, 0] })
  ).toBeNull()
  expect(
    estimateEyeOrigin({ ...input, intrinsics: { ...input.intrinsics, fx: 0 } })
  ).toBeNull()
  expect(
    estimateEyeOrigin({ ...input, rightAnchorPixels: input.leftAnchorPixels })
  ).toBeNull()
  expect(
    estimateEyeOrigin({ ...input, anchorSpanMetres: [-0.06, 0, 0] })
  ).toBeNull()
})

test("doubling an assumed face size doubles estimated distance, exposing scale ambiguity", () => {
  const original = estimateEyeOrigin(input)!
  const changed = estimateEyeOrigin({
    ...input,
    anchorSpanMetres: [0.12, 0, 0],
  })!
  expect(changed.originMetres[2]).toBeCloseTo(2 * original.originMetres[2], 12)
})

test("rigid anchor midpoint needs an explicit offset to the actual eye-center midpoint", () => {
  const result = estimateEyeOrigin({
    ...input,
    eyeCenterFromAnchorMidpointMetres: [0.01, -0.005, 0.008],
  })!
  expect(result.originMetres[0]).toBeCloseTo(-0.01, 12)
  expect(result.originMetres[1]).toBeCloseTo(-0.03166666666666667, 12)
  expect(result.originMetres[2]).toBeCloseTo(0.608, 12)
  expect(
    estimateEyeOrigin({
      ...input,
      eyeCenterFromAnchorMidpointMetres: undefined as unknown as [
        number,
        number,
        number,
      ],
    })
  ).toBeNull()
})
