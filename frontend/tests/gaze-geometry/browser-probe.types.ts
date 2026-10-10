import type { Vector3 } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

export type ModelParityReference = {
  crop: string
  headAnglesDegrees: Vector3
  expectedIrVector: Vector3
}

export type BrowserGazeProbeResult = {
  evidence: "browser-inference-parity-only"
  accuracyMeasuredOnCamera: false
  fpsMeasuredOnPhone: false
  cases: number
  maxAbsoluteDifference: number
  modelLoadMs: number
  medianInferenceMs: number
  p95InferenceMs: number
  disposedCallRejected: boolean
  overlappingCallRejected: boolean
  rawVectorProjectionRejected: boolean
  userAgent: string
}

export type BrowserGazeProbeScope = typeof globalThis & {
  runBrowserGazeProbe: () => Promise<BrowserGazeProbeResult>
}
