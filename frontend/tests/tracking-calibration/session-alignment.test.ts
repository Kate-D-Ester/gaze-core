import { expect, test } from "bun:test"
import {
  fitSessionAlignment,
  applySessionAlignment,
  evaluateReturnCheck,
  evaluatePersonalResidual,
} from "../../apps/web/src/features/tracking-calibration/session-alignment"
import type { AlignmentSample } from "../../apps/web/src/features/tracking-calibration/session-alignment.types"
import { advanceCalibrationReuse } from "../../research/calibration/calibration-reuse"
const samples: AlignmentSample[] = [
  { predicted: [0.2, 0.3], target: [0.3, 0.35], targetId: 0, timestamp: 1 },
  { predicted: [0.6, 0.3], target: [0.7, 0.35], targetId: 1, timestamp: 2 },
  { predicted: [0.4, 0.65], target: [0.5, 0.7], targetId: 2, timestamp: 3 },
]
test("one labelled target determines only translation, never affine", () => {
  const translation = fitSessionAlignment(samples.slice(0, 1), "translation")!
  expect(applySessionAlignment([0.4, 0.5], translation)![0]).toBeCloseTo(0.5)
  expect(fitSessionAlignment(samples.slice(0, 1), "affine")).toBeNull()
  expect(translation.verified).toBe(false)
})
test("affine uses existing QR and rejects collinear geometry", () => {
  const affine = fitSessionAlignment(samples, "affine")!
  expect(applySessionAlignment([0.4, 0.5], affine)![0]).toBeCloseTo(0.5)
  expect(
    fitSessionAlignment(
      samples.map((sample) => ({
        ...sample,
        predicted: [sample.predicted[0], 0.3],
      })),
      "affine"
    )
  ).toBeNull()
  expect(affine.verified).toBe(false)
})
test("a short return check tests translation on an independent third target", () => {
  const readings = samples.map((sample) => ({
    ...sample,
    point: sample.predicted,
  }))
  const result = evaluateReturnCheck(readings, { width: 1000, height: 1000 })
  expect(result.offset?.[0]).toBeCloseTo(0.1)
  expect(result.offset?.[1]).toBeCloseTo(0.05)
  const rotated = readings.map((sample, index) => ({
    ...sample,
    point: [sample.point[0], sample.point[1] + index * 0.1] as [number, number],
  }))
  expect(
    evaluateReturnCheck(rotated, { width: 1000, height: 1000 }).offset
  ).toBeNull()
})
test("failed validation or interruption preserves accepted correction", () => {
  const accepted = fitSessionAlignment(samples, "translation")!
  let state = advanceCalibrationReuse(
    { phase: "restored", accepted, candidate: null },
    { type: "check" }
  )
  state = advanceCalibrationReuse(state, {
    type: "candidate",
    alignment: accepted,
  })
  state = advanceCalibrationReuse(state, { type: "pause" })
  expect(state.accepted).toBe(accepted)
  state = advanceCalibrationReuse(state, { type: "failed" })
  expect(state.phase).toBe("needs-calibration")
  expect(state.accepted).toBe(accepted)
  expect(state.candidate).toBeNull()
})

test("five-target residual repairs a supported base map without refitting eye or head geometry", () => {
  const targets = [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.2],
    [0.8, 0.8],
    [0.2, 0.8],
  ] as [number, number][]
  const readings = targets.map((target, index) => ({
    timestamp: index,
    targetId: index,
    target,
    point: [(target[0] - 0.03) / 1.1, (target[1] + 0.02) / 0.9] as [
      number,
      number,
    ],
  }))
  const fitted = evaluatePersonalResidual(
    readings,
    { width: 1000, height: 1000 },
    true
  )
  expect(fitted.alignment?.method).toBe("affine")
  expect(fitted.metrics.rmsPixels).toBeLessThan(0.001)
  expect(
    evaluatePersonalResidual(readings, { width: 1000, height: 1000 }, false)
      .alignment
  ).toBeNull()
  readings[4]!.point = [0.9, 0.1]
  expect(
    evaluatePersonalResidual(readings, { width: 1000, height: 1000 }, true)
      .alignment
  ).toBeNull()
})
