import { expect, test } from "bun:test"
import * as calibration from "../../apps/web/src/features/remote-eye-tracking/calibration-comparison"

test("candidate selection protects every target and fixation stability", () => {
  expect(typeof calibration.improvesCalibration).toBe("function")
  const baseline = {
    rms: 0.1,
    targets: [
      { key: "corner", rms: 0.1, jitter: 0.02 },
      { key: "center", rms: 0.1, jitter: 0.02 },
    ],
  }
  const better = {
    rms: 0.06,
    targets: baseline.targets.map((target) => ({
      ...target,
      rms: 0.06,
      jitter: 0.015,
    })),
  }
  expect(calibration.improvesCalibration(better, baseline)).toBe(true)
  expect(
    calibration.improvesCalibration(
      {
        ...better,
        targets: [{ ...better.targets[0]!, rms: 0.2 }, better.targets[1]!],
      },
      baseline
    )
  ).toBe(false)
  expect(
    calibration.improvesCalibration(
      {
        ...better,
        targets: [{ ...better.targets[0]!, jitter: 0.06 }, better.targets[1]!],
      },
      baseline
    )
  ).toBe(false)
  expect(
    calibration.improvesCalibration(
      { ...better, targets: better.targets.slice(1) },
      baseline
    )
  ).toBe(false)
})
