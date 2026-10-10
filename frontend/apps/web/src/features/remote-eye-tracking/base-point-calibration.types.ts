import type { Point, RemoteCalibration } from "./remote-eye-tracking.types"

export type BasePointFitIssue =
  "missing-readings" | "incompatible-readings" | "insufficient-response"

export type BasePointFitResult =
  | { model: RemoteCalibration; issue: null; retryTargets: Point[] }
  | { model: null; issue: BasePointFitIssue; retryTargets: Point[] }
