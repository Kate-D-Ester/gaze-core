import type { SelectionBubble } from "./bubble-selection.types"
import type { GazeMeasurement } from "../scene-eye-tracking/scene.types"
export type ImagePoint = readonly [number, number]
export type ImageBounds = Pick<DOMRect, "left" | "top" | "width" | "height">
export type GazeEvidence = {
  bubble?: SelectionBubble | null
  measurement: GazeMeasurement
  allowUnverifiedGaze?: boolean
  sourceGeneration: number
  mediaTime: number
}
export type SelectionState = {
  selectedId: string | null
  generation: number
  paused: boolean
  pending: { id: string; since: number } | null
  reason: string
}
