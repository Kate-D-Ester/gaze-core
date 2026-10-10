import type {
  RgbBackend,
  RgbBackendMeasurement,
  RgbBackendProbe,
} from "./rgb-backend.types"

const MIN_SPEEDUP = 0.15
const MAX_PREDICTION_DIFFERENCE = 0.005

async function measureBackend(
  backend: RgbBackend,
  probe: RgbBackendProbe
): Promise<RgbBackendMeasurement | null> {
  try {
    if (!(await probe.activate(backend))) {
      return null
    }
    // Identical tensor shapes compile/upload once before timing either image.
    await probe.predict(0)
    const predictions = []
    let elapsed = 0
    for (const sample of [0, 1]) {
      const start = probe.now()
      const point = await probe.predict(sample)
      const duration = probe.now() - start
      if (
        !point ||
        point.length !== 2 ||
        !point.every(Number.isFinite) ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        return null
      }
      predictions.push(point)
      elapsed += duration
    }
    return { backend, milliseconds: elapsed / 2, predictions }
  } catch {
    return null
  }
}

/** Choose once, before calibration; runtime availability alone says nothing about speed. */

export async function selectRgbBackend(
  preferred: RgbBackend,
  probe: RgbBackendProbe
): Promise<RgbBackend> {
  const candidates: RgbBackend[] = ["wasm", "webgl"]
  if (preferred === "cpu") {
    candidates.push("cpu")
  }
  const measurements: RgbBackendMeasurement[] = []
  for (const backend of candidates) {
    const measurement = await measureBackend(backend, probe)
    if (!measurement) {
      continue
    }
    const reference = measurements[0]
    const agrees =
      !reference ||
      measurement.predictions.every((point, index) => {
        const expected = reference.predictions[index]
        return (
          Math.hypot(point[0] - expected[0], point[1] - expected[1]) <=
          MAX_PREDICTION_DIFFERENCE
        )
      })
    if (agrees) {
      measurements.push(measurement)
    }
  }
  if (!measurements.length && preferred !== "cpu") {
    const fallback = await measureBackend("cpu", probe)
    if (fallback) {
      measurements.push(fallback)
    }
  }
  let selected = measurements.find((item) => item.backend === preferred)
  selected ??= measurements[0]
  if (!selected) {
    throw new Error("No reliable local gaze inference backend is available")
  }
  for (const measurement of measurements) {
    if (measurement.milliseconds < selected.milliseconds * (1 - MIN_SPEEDUP)) {
      selected = measurement
    }
  }
  const alternatives = measurements
    .filter((measurement) => measurement !== selected)
    .sort((first, second) => first.milliseconds - second.milliseconds)
  for (const measurement of [selected, ...alternatives]) {
    if (await probe.activate(measurement.backend)) {
      return measurement.backend
    }
  }
  throw new Error(
    "The measured local gaze inference backends became unavailable"
  )
}
