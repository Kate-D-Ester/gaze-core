import type { ViewerCamera } from "./viewer-camera.types"
import type { PreviewPoint } from "./selection.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"

export type ObjectBox = readonly [number, number, number, number]
export type ObjectChoice = { point: PreviewPoint } | { box: ObjectBox }
export type FrameContext = {
  sourceKey: string
  transformKey: string
  generation: number
  timestamp: number
}
export type ObjectReference = FrameContext & {
  box: ObjectBox
  label: string
  token: string
}
export type ObjectMatch = FrameContext & {
  box: ObjectBox
  score: number
  method?: "temporal" | "appearance" | "flow"
}
export type ObjectTrackingSnapshot = {
  status: "idle" | "selecting" | "searching" | "matched" | "ambiguous" | "error"
  reference: ObjectReference | null
  match: ObjectMatch | null
  scene?: ObjectMatch | null
  error: string
}
export type VisionRequest =
  | { action: "select"; image: string; point?: PreviewPoint; box?: ObjectBox }
  | { action: "match"; token: string; image: string; stream?: number }
  | { action: "track"; token: string; image: string }
  | { action: "clear"; token: string }
export type VisionRecord = Record<string, unknown>
export type VisionTransport = (
  request: VisionRequest,
  signal: AbortSignal
) => Promise<VisionRecord>
export type TrackingDependencies = {
  request?: VisionTransport
  encode?: (camera: ViewerCamera) => string
  now?: () => number
}
export type ObjectOverlayProps = {
  role: "scene" | "auxiliary"
  tracking: ObjectTrackingSnapshot
  camera: SceneCameraSnapshot
  now: number
  region?: ObjectBox | null
}
export type PointerRegion = {
  start: PreviewPoint
  current: PreviewPoint
  startX: number
  startY: number
  id: number
  sourceKey: string
  generation: number
  transformKey: string
}
export type ObjectRegion = {
  box: ObjectBox
  sourceKey: string
  generation: number
}
