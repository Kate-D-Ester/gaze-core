import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type {
  PreviewPoint,
  VisualSelection,
  VisualSelections,
  SelectionSnapshots,
} from "./selection.types"

export function hasFreshFrame(
  state: SceneCameraSnapshot,
  now: number
): boolean {
  const frame = state.frame
  return (
    !!state.source &&
    state.connection === "live" &&
    !state.busy &&
    !!frame &&
    frame.width > 0 &&
    frame.height > 0 &&
    Number.isFinite(frame.timestamp) &&
    Number.isFinite(now) &&
    now >= frame.timestamp &&
    now - frame.timestamp <= 1000
  )
}

export function createVisualSelection(
  point: PreviewPoint,
  state: SceneCameraSnapshot,
  now: number
): VisualSelection | null {
  if (
    !hasFreshFrame(state, now) ||
    point.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    return null
  }
  return {
    point: [...point],
    sourceKey: state.source!.key,
    generation: state.frame!.generation,
  }
}

export function isSelectionCurrent(
  selection: VisualSelection | null,
  state: SceneCameraSnapshot,
  now: number
): boolean {
  return (
    !!selection &&
    hasFreshFrame(state, now) &&
    selection.sourceKey === state.source!.key &&
    selection.generation === state.frame!.generation
  )
}

export function pruneVisualSelections(
  selections: VisualSelections,
  snapshots: SelectionSnapshots,
  now: number
): VisualSelections {
  let next = selections
  for (const role of Object.keys(selections) as (keyof VisualSelections)[]) {
    const selected = selections[role]
    if (selected && !isSelectionCurrent(selected, snapshots[role], now)) {
      if (next === selections) {
        next = { ...selections }
      }
      delete next[role]
    }
  }
  return next
}
