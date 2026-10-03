import type { GazeMeasurement } from "../scene-eye-tracking/scene.types"
export type ImagePoint = readonly [number, number]
export type ImageBounds = Pick<DOMRect, "left" | "top" | "width" | "height">
export type GazeEvidence = {
  measurement: GazeMeasurement
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
