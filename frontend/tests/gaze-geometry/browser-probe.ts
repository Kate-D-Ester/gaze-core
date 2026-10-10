import { loadNativeGazeModel } from "../../research/gaze-3d/browser/native-gaze-model"
import { projectRemoteGaze } from "../../research/gaze-3d/browser/gaze-adapters"
import type { NativeGazeInput } from "../../research/gaze-3d/browser/native-gaze-model.types"
import type { CameraGazeMeasurement } from "../../research/gaze-3d/browser/gaze-adapters.types"
import type {
  BrowserGazeProbeResult,
  BrowserGazeProbeScope,
  ModelParityReference,
} from "./browser-probe.types"
import referenceRows from "./model-parity-reference.json"

function syntheticEye(crop: string, right: boolean): Float32Array {
  const values = new Float32Array(10800)
  const skin = right ? [140, 163, 187] : [145, 168, 190]
  let pupilX = 30
  let pupilY = 30
  if (crop === "synthetic_shifted") {
    pupilX = right ? 23 : 22
    pupilY = 26
  }
  for (let channel = 0; channel < 3; channel++) {
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) {
        const index = channel * 3600 + y * 60 + x
        if (crop === "zero") {
          continue
        }
        if (crop === "flat_127") {
          values[index] = 127
          continue
        }
        if (crop === "asymmetric_gradients") {
          const column = right ? 59 - x : x
          if (channel === 0) {
            values[index] = (column / 59) * 255
          } else if (channel === 1) {
            values[index] = (y / 59) * 255
          } else {
            values[index] = ((column + y) / 118) * 255
          }
          continue
        }
        const eyelid = ((x - 30) / 26) ** 2 + ((y - 30) / 11) ** 2 < 1
        values[index] = skin[channel]
        if (eyelid) {
          values[index] = 225
          const radiusSquared = (x - pupilX) ** 2 + (y - pupilY) ** 2
          if (radiusSquared < 64) {
            values[index] = 45 + 5 * channel
          }
          if (radiusSquared < 16) {
            values[index] = 12
          }
        }
      }
    }
  }
  return values
}

export async function runBrowserGazeProbe(): Promise<BrowserGazeProbeResult> {
  const started = performance.now()
  const model = await loadNativeGazeModel()
  const modelLoadMs = performance.now() - started
  let maxAbsoluteDifference = 0
  let lastInput: NativeGazeInput | null = null
  let rawVectorProjectionRejected = false
  let overlappingCallRejected = false
  const durations: number[] = []
  try {
    for (const row of referenceRows as ModelParityReference[]) {
      lastInput = {
        leftEye: syntheticEye(row.crop, false),
        rightEye: syntheticEye(row.crop, true),
        headAnglesDegrees: row.headAnglesDegrees,
      }
      const result = await model.predict(lastInput)
      for (let axis = 0; axis < 3; axis++) {
        maxAbsoluteDifference = Math.max(
          maxAbsoluteDifference,
          Math.abs(result.vector[axis] - row.expectedIrVector[axis])
        )
      }
      const rejected = projectRemoteGaze(
        result as unknown as CameraGazeMeasurement,
        {
          centerMetres: [0, 0, 0],
          right: [1, 0, 0],
          down: [0, 1, 0],
          widthMetres: 0.34,
          heightMetres: 0.19125,
          pixelWidth: 1512,
          pixelHeight: 850,
        }
      )
      rawVectorProjectionRejected =
        rejected.kind === "unavailable" &&
        rejected.reason === "invalid-measurement"
    }
    if (
      !lastInput ||
      maxAbsoluteDifference > 2e-5 ||
      !rawVectorProjectionRejected
    ) {
      throw new Error(
        `Browser model parity/coordinate guard failed: ${maxAbsoluteDifference}`
      )
    }
    const active = model.predict(lastInput)
    try {
      await model.predict(lastInput)
    } catch {
      overlappingCallRejected = true
    }
    await active
    for (let warmup = 0; warmup < 5; warmup++) {
      await model.predict(lastInput)
    }
    for (let run = 0; run < 100; run++) {
      durations.push((await model.predict(lastInput)).inferenceMs)
    }
  } finally {
    await model.dispose()
    await model.dispose()
  }
  let disposedCallRejected = false
  try {
    await model.predict(lastInput!)
  } catch {
    disposedCallRejected = true
  }
  durations.sort((first, second) => first - second)
  if (!disposedCallRejected || !overlappingCallRejected) {
    throw new Error("Browser model lifecycle checks failed")
  }
  return {
    evidence: "browser-inference-parity-only",
    accuracyMeasuredOnCamera: false,
    fpsMeasuredOnPhone: false,
    cases: referenceRows.length,
    maxAbsoluteDifference,
    modelLoadMs,
    medianInferenceMs: durations[50],
    p95InferenceMs: durations[94],
    disposedCallRejected,
    overlappingCallRejected,
    rawVectorProjectionRejected,
    userAgent: navigator.userAgent,
  }
}

const scope = globalThis as BrowserGazeProbeScope
scope.runBrowserGazeProbe = runBrowserGazeProbe
