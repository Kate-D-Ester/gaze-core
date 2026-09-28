import type { TrackingFrame } from "../types"

export type PipelinePreviewsProps = {
  frame: TrackingFrame | null
}

export type MaskPreviewProps = {
  mask: Uint8Array
  width: number
  height: number
}
