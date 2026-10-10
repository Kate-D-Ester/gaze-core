import type { SessionAlignment } from "../tracking-calibration/session-alignment.types"
import type {
  Point,
  RemoteCalibration,
  RemoteObservation,
} from "./remote-eye-tracking.types"

export type RemoteLiveTraceEntry = {
  observation: RemoteObservation
  mappedPoint: Point | null
  screenPoint: Point | null
}

export type RemoteLiveTraceOptions = Omit<
  RemoteLiveTraceEntry,
  "observation"
> & {
  observation: RemoteObservation | null
  calibration: RemoteCalibration | null
  alignment: SessionAlignment | null
  offset: Point
  width: number
  height: number
  enabled: boolean
}
