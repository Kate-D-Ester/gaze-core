import { expect, test } from "bun:test"
import { fitNonlinearModel } from "../../apps/web/src/features/eye-tracking/head-tracking/nonlinear-fit"

test("the small bounded solver identifies an observable parameter", () => {
  const fit = fitNonlinearModel(
    [0],
    { minimum: [-10], maximum: [10] },
    (values) => [2 * values[0] - 4]
  )
  expect(fit?.parameters[0]).toBeCloseTo(2, 5)
  expect(fit?.rank).toBe(1)
})

test("damping does not certify constant or dependent parameters", () => {
  const bounds = { minimum: [-10, -10], maximum: [10, 10] }
  expect(fitNonlinearModel([0, 0], bounds, () => [0, 0])?.rank).toBe(0)
  const fit = fitNonlinearModel([0, 0], bounds, (values) => [
    values[0] + values[1] - 2,
    2 * (values[0] + values[1] - 2),
  ])
  expect(fit?.rank).toBe(1)
})
