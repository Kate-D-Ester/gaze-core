import type { Point } from "../remote-eye-tracking.types"
import type { RemoteTrackingVectors } from "../tracking-vectors.types"

export type RemoteVectorOverlayProps = {
  vectors: RemoteTrackingVectors
  faceWidth: number
}

export type VectorArrowProps = {
  origin: Point
  delta: Point
  color: string
  label: string
}
