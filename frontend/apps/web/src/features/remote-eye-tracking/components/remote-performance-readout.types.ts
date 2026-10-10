import type { RemoteObservation } from "../remote-eye-tracking.types"

export type RemotePerformanceReadoutProps = {
  fps: number
  ready: boolean
  status: string
  observation: RemoteObservation | null
}
