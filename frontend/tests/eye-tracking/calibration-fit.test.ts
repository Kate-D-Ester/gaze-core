import { afterEach, expect, mock, test } from "bun:test"
import { fitCalibrationInWorker } from "../../apps/web/src/features/eye-tracking/calibration-fit"
import type {
  CalibrationFitRequest,
  CalibrationFitResponse,
} from "../../apps/web/src/features/eye-tracking/calibration.worker.types"

const originalWorker = globalThis.Worker
class WorkerDouble {
  static instances: WorkerDouble[] = []
  onmessage = (_message: MessageEvent<CalibrationFitResponse>) => {}
  onerror = () => {}
  terminate = mock(() => {})
  postMessage = mock((_request: CalibrationFitRequest) => {})
  constructor() {
    WorkerDouble.instances.push(this)
  }
}
const request: CalibrationFitRequest = {
  samples: [],
  orientation: { horizontal: -1, vertical: 1 },
  screenAspectRatio: 1.6,
}

afterEach(() => {
  globalThis.Worker = originalWorker
  WorkerDouble.instances = []
})

test("cancelling a pending fit terminates its worker and ignores late replies", async () => {
  globalThis.Worker = WorkerDouble as unknown as typeof Worker
  const controller = new AbortController()
  const result = fitCalibrationInWorker(request, controller.signal)
  const worker = WorkerDouble.instances[0]
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: "AbortError" })
  expect(worker.terminate).toHaveBeenCalledTimes(1)
  worker.onmessage({
    data: { calibration: null, issue: null, error: "" },
  } as MessageEvent<CalibrationFitResponse>)
  expect(worker.terminate).toHaveBeenCalledTimes(1)
})

test("worker errors release resources and reach the user-facing error path", async () => {
  globalThis.Worker = WorkerDouble as unknown as typeof Worker
  const result = fitCalibrationInWorker(request, new AbortController().signal)
  const worker = WorkerDouble.instances[0]
  worker.onerror()
  await expect(result).rejects.toThrow("calibration worker stopped")
  expect(worker.terminate).toHaveBeenCalledTimes(1)
})

test("an already cancelled fit does not start a worker", async () => {
  globalThis.Worker = WorkerDouble as unknown as typeof Worker
  const controller = new AbortController()
  controller.abort()
  await expect(
    fitCalibrationInWorker(request, controller.signal)
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(WorkerDouble.instances).toHaveLength(0)
})

test("a usable screen mapping and its head-fit issue both reach the caller", async () => {
  globalThis.Worker = WorkerDouble as unknown as typeof Worker
  const result = fitCalibrationInWorker(request, new AbortController().signal)
  const worker = WorkerDouble.instances[0]
  const response = {
    calibration: {
      coefficients: [
        [0, 1, 0],
        [0, 0, 1],
      ],
      validationError: 0.01,
    },
    issue: { code: "head-movement", message: "Not enough tilting movement." },
    error: "",
  } as CalibrationFitResponse
  worker.onmessage({ data: response } as MessageEvent<CalibrationFitResponse>)
  await expect(result).resolves.toEqual({
    calibration: response.calibration,
    issue: response.issue,
  })
  expect(worker.terminate).toHaveBeenCalledTimes(1)
})
