import type { Point } from "../remote-eye-tracking.types"
import type { RemoteTrackingVectors } from "../tracking-vectors.types"

export type RemoteVectorReadoutProps = {
  vectors: RemoteTrackingVectors | null
  beforeHeadCorrection: Point | null
  afterHeadCorrection: Point | null
  headCorrectionActive: boolean
  jointMotion?: boolean
}
