import type { Point } from "./remote-eye-tracking.types"

export type RgbBackend = "wasm" | "webgl" | "cpu"

/** Hardware operations are injected so selection can be tested without a GPU. */
export type RgbBackendProbe = {
  activate: (backend: RgbBackend) => Promise<boolean>
  predict: (sample: number) => Promise<Point | null>
  now: () => number
}

export type RgbBackendMeasurement = {
  backend: RgbBackend
  milliseconds: number
  predictions: Point[]
}
