import type { CameraRole } from "./commands.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
export type PreviewPoint = readonly [number, number]
export type VisualSelection = {
  point: PreviewPoint
  sourceKey: string
  generation: number
}

export type VisualSelections = Partial<Record<CameraRole, VisualSelection>>
export type SelectionSnapshots = Readonly<
  Record<CameraRole, SceneCameraSnapshot>
>
