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

export function boxAtTime(track: FaceTrack, timestamp: number): Box | null {
  let closest = null
  let distance = 0.35
  for (const observation of track.observations) {
    const delta = Math.abs(observation.timestamp - timestamp)
    if (delta <= distance) {
      closest = observation.box
      distance = delta
    }
  }
  return closest
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
  observeGaze(
    evidence: GazeEvidence,
    tracks: readonly FaceTrack[],
    now: number
  ): SelectionState {
    if (evidence.sourceGeneration !== this.sourceGeneration) {
      this.reset(evidence.sourceGeneration)
    }
    const selected = tracks.find(
      (track) => track.id === this.current.selectedId
    )
    const selectedBox = selected
      ? boxAtTime(selected, evidence.mediaTime)
      : null
    if (this.current.selectedId && !selectedBox && !this.current.paused) {
      this.current = {
        ...this.current,
        paused: true,
        generation: this.current.generation + 1,
        pending: null,
        reason: "Selected face was lost; reacquire it",
      }
    }
    const gaze = evidence.measurement
    const times = [gaze.timestamp, gaze.eyeTimestamp, gaze.sceneTimestamp]
    const verified =
      gaze.valid &&
      !gaze.estimated &&
      !gaze.preview &&
      !gaze.extrapolated &&
      Number.isFinite(gaze.confidence) &&
      gaze.confidence >= 0.5 &&
      gaze.position &&
      times.every(
        (time) =>
          time !== null &&
          Number.isFinite(time) &&
          now - time >= 0 &&
          now - time <= 150
      ) &&
      Number.isFinite(now)
    if (
      !verified ||
      !gaze.position ||
      gaze.position.some(
        (value) => !Number.isFinite(value) || value < 0 || value > 1
      )
    ) {
      this.current.pending = null
      this.lastEvidence = -Infinity
      return this.state
    }
    if (now - this.lastEvidence > 150) {
      this.current.pending = null
    }
    this.lastEvidence = now
    const target = selectByPoint(tracks, gaze.position, evidence.mediaTime)
    if (
      selectedBox &&
      !this.current.paused &&
      contains(selectedBox, gaze.position, 0.025)
    ) {
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
