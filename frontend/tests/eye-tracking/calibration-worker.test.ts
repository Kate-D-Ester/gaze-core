import { afterAll, beforeAll, expect, test } from "bun:test"
import { mapGaze } from "../../apps/web/src/features/eye-tracking/calibration"
import {
  fixtureCalibrationSamples,
  fixtureEyeFeature,
  fixtureReference,
  fixtureTargets,
} from "./head-motion-fixture"
import type {
  CalibrationFitRequest,
  CalibrationFitResponse,
} from "../../apps/web/src/features/eye-tracking/calibration.worker.types"
import type { CalibrationSample } from "../../apps/web/src/features/eye-tracking/calibration.types"

const responses: CalibrationFitResponse[] = []
const workerScope = {
  onmessage: (_event: MessageEvent<CalibrationFitRequest>) => {},
  postMessage(response: CalibrationFitResponse) {
    responses.push(response)
  },
}
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, "self")

beforeAll(async () => {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: workerScope,
  })
  await import("../../apps/web/src/features/eye-tracking/calibration.worker")
})

afterAll(() => {
  if (originalSelf) Object.defineProperty(globalThis, "self", originalSelf)
  else Reflect.deleteProperty(globalThis, "self")
})

function fit(samples: CalibrationSample[]): CalibrationFitResponse {
  workerScope.onmessage({
    data: {
      samples,
      orientation: { horizontal: -1, vertical: 1 },
      screenAspectRatio: 1.6,
    },
  } as MessageEvent<CalibrationFitRequest>)
  return responses.at(-1)!
}

test("a head-fit failure preserves the completed screen mapping and explains the failed check", () => {
  const samples = fixtureTargets.map((target) => ({
    target,
    feature: fixtureEyeFeature(target, fixtureReference),
    headPose: fixtureReference,
  }))
  const response = fit(samples)
  expect(response.calibration).not.toBeNull()
  expect(response.calibration?.headCompensation).toBeUndefined()
  expect(response).toMatchObject({
    error: "",
    issue: { code: "head-movement" },
  })
  const point = mapGaze(
    response.calibration!,
    fixtureEyeFeature([0.8, 0.2], fixtureReference)
  )!
  expect(Math.hypot(point[0] - 0.8, point[1] - 0.2)).toBeLessThan(0.01)
})

test("head movement readings are excluded from the eye-only fallback", () => {
  const samples = fixtureCalibrationSamples()
  for (const sample of samples.slice(9)) sample.headPose = fixtureReference
  const response = fit(samples)
  expect(response.calibration).not.toBeNull()
  expect(response.calibration?.headCompensation).toBeUndefined()
  expect(response.calibration!.validationError).toBeLessThan(0.01)
})

test("an invalid screen grid cannot be accepted as a fallback", () => {
  const samples = fixtureTargets.map((target) => ({
    target,
    feature: [0, 0] as CalibrationSample["feature"],
    headPose: fixtureReference,
  }))
  const response = fit(samples)
  expect(response.calibration).toBeNull()
  expect(response).toMatchObject({ issue: { code: "screen-fit" } })
})

test("valid head compensation is retained instead of falling back", () => {
  const response = fit(fixtureCalibrationSamples())
  expect(response.calibration?.headCompensation).toBeDefined()
  expect(response).toMatchObject({ issue: null, error: "" })
})

test("a finite inconsistent screen fit stays available as an unverified preview", () => {
  const samples = fixtureTargets.map((target, index) => ({
    target,
    feature: [
      Math.sin(index * 2),
      Math.cos(index * 3),
    ] as CalibrationSample["feature"],
  }))
  const response = fit(samples)
  expect(response.calibration).not.toBeNull()
  expect(response.calibration!.validationError).toBeGreaterThan(0.16)
  expect(response.issue?.code).toBe("screen-fit")
  expect(response.calibration!.coefficients.flat().every(Number.isFinite)).toBe(
    true
  )
})
