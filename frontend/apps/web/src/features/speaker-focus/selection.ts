import { verifiedGazePoint } from "./gaze-evidence"
import { selectByBubble } from "./bubble-selection"
export { verifiedGazePoint } from "./gaze-evidence"
import { boxAtTime } from "./face-geometry"
export { boxAtTime } from "./face-geometry"
import type { Box, FaceTrack } from "./client.types"
import type {
  GazeEvidence,
  ImageBounds,
  ImagePoint,
  SelectionState,
} from "./selection.types"

export function imagePoint(
  point: ImagePoint,
  bounds: ImageBounds,
  width: number,
  height: number
): ImagePoint | null {
  if (
    ![
      ...point,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      width,
      height,
    ].every(Number.isFinite) ||
    Math.min(width, height, bounds.width, bounds.height) <= 0
  ) {
    return null
  }
  const scale = Math.min(bounds.width / width, bounds.height / height)
  const x =
    (point[0] - bounds.left - (bounds.width - width * scale) / 2) /
    (width * scale)
  const y =
    (point[1] - bounds.top - (bounds.height - height * scale) / 2) /
    (height * scale)
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null
  }
  return [x, y]
}

function contains(box: Box, point: ImagePoint, margin = 0): boolean {
  return (
    point[0] >= box[0] - margin &&
    point[0] <= box[0] + box[2] + margin &&
    point[1] >= box[1] - margin &&
    point[1] <= box[1] + box[3] + margin
  )
}
export function selectByPoint(
  tracks: readonly FaceTrack[],
  point: ImagePoint,
  timestamp: number
): string | null {
  if (
    ![...point, timestamp].every(Number.isFinite) ||
    point.some((value) => value < 0 || value > 1)
  ) {
    return null
  }
  const matches = tracks.filter((track) => {
    const box = boxAtTime(track, timestamp)
    return box && contains(box, point)
  })
  return matches.length === 1 ? matches[0]!.id : null
}

export class SelectionController {
  private current: SelectionState = {
    selectedId: null,
    generation: 0,
    pending: null,
    paused: false,
    reason: "Select a visible face",
  }
  private sourceGeneration: number
  private lastEvidence = -Infinity
  constructor(sourceGeneration = 1) {
    this.sourceGeneration = sourceGeneration
  }
  get state(): SelectionState {
    return {
      ...this.current,
      pending: this.current.pending ? { ...this.current.pending } : null,
    }
  }
  reset(sourceGeneration: number): SelectionState {
    this.sourceGeneration = sourceGeneration
    this.lastEvidence = -Infinity
    return this.clear()
  }
  resetDwell(): void {
    this.current.pending = null
    this.lastEvidence = -Infinity
  }
  clear(): SelectionState {
    this.current = {
      selectedId: null,
      generation: this.current.generation + 1,
      pending: null,
      paused: false,
      reason: "Select a visible face",
    }
    return this.state
  }
  private choose(id: string | null, reason: string): SelectionState {
    if (id !== this.current.selectedId || this.current.paused) {
      this.current.generation++
    }
    this.current = {
      ...this.current,
      selectedId: id,
      pending: null,
      paused: false,
      reason,
    }
    return this.state
  }
  click(
    tracks: readonly FaceTrack[],
    point: ImagePoint,
    timestamp: number
  ): SelectionState {
    return this.choose(
      selectByPoint(tracks, point, timestamp),
      "Click selection"
    )
  }
  checkTracks(tracks: readonly FaceTrack[], timestamp: number): SelectionState {
    const selected = tracks.find(
      (track) => track.id === this.current.selectedId
    )
    const selectedBox = selected ? boxAtTime(selected, timestamp) : null
    if (this.current.selectedId && !selectedBox && !this.current.paused) {
      this.current = {
        ...this.current,
        paused: true,
        generation: this.current.generation + 1,
        pending: null,
        reason: "Selected face was lost; reacquire it",
      }
    }
    return this.state
  }
  observeGaze(
    evidence: GazeEvidence,
    tracks: readonly FaceTrack[],
    now: number
  ): SelectionState {
    if (evidence.sourceGeneration !== this.sourceGeneration) {
      this.reset(evidence.sourceGeneration)
    }
    this.checkTracks(tracks, evidence.mediaTime)
    const point = verifiedGazePoint(evidence.measurement, now)
    const bubble = evidence.bubble
    if (
      !point ||
      !bubble ||
      bubble.timestamp !== evidence.measurement.timestamp
    ) {
      this.resetDwell()
      return this.state
    }
    if (now - this.lastEvidence > 150) {
      this.current.pending = null
    }
    this.lastEvidence = now
    const target = selectByBubble(
      tracks,
      bubble,
      evidence.mediaTime,
      this.current.selectedId
    )
    if (target === this.current.selectedId && !this.current.paused) {
      this.current.pending = null
      return this.state
    }
    if (!target) {
      this.current.pending = null
      return this.state
    }
    if (this.current.pending?.id !== target) {
      this.current.pending = { id: target, since: now }
    }
    if (now - this.current.pending.since >= 500) {
      return this.choose(target, "Verified gaze selection")
    }
    this.current.reason = "Hold gaze on one visible face"
    return this.state
  }
}
