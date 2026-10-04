import { boxAtTime } from "./face-geometry"
import type { Box, FaceTrack } from "./client.types"
import type { ImagePoint } from "./selection.types"
function overlap(a: Box, b: Box): number {
  const width = Math.max(
    0,
    Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])
  )
  const height = Math.max(
    0,
    Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])
  )
  const intersection = width * height
  return intersection / (a[2] * a[3] + b[2] * b[3] - intersection)
}
/** Reject ambiguous or stale matches instead of choosing a detector index. */
export function matchFaceLocation(
  box: Box,
  tracks: readonly FaceTrack[],
  timestamp: number
): string | null {
  const candidates = tracks
    .flatMap((track) => {
      const current = boxAtTime(track, timestamp)
      return current ? [{ id: track.id, score: overlap(box, current) }] : []
    })
    .filter((candidate) => candidate.score >= 0.3)
    .sort((a, b) => b.score - a.score)
  const first = candidates[0]
  if (!first || (candidates[1] && first.score - candidates[1].score < 0.1)) {
    return null
  }
  return first.id
}
export class FaceLocations {
  private tracks: FaceTrack[] = []
  private sequence = 0
  reset(): void {
    this.tracks = []
  }
  update(boxes: readonly Box[], timestamp: number): FaceTrack[] {
    const previous = this.tracks
    const matches = boxes.map((box) =>
      matchFaceLocation(box, previous, timestamp)
    )
    this.tracks = boxes.map((box, index) => {
      let id = matches[index] ?? null
      const old = previous.find((track) => track.id === id)
      const oldBox = old ? boxAtTime(old, timestamp) : null
      if (
        oldBox &&
        boxes.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            overlap(box, oldBox) - overlap(other, oldBox) < 0.15
        )
      ) {
        id = null
      }
      if (!id) {
        id = `preview-${++this.sequence}`
      }
      return { id, manual: false, observations: [{ timestamp, box }] }
    })
    return this.tracks
  }
}

export function faceBox(
  points: readonly ImagePoint[],
  region: Box | null = null
): Box | null {
  if (!points.length || points.some((point) => !point.every(Number.isFinite))) {
    return null
  }
  const crop = region ?? [0, 0, 1, 1]
  const x = Math.max(0, Math.min(...points.map((point) => point[0])))
  const y = Math.max(0, Math.min(...points.map((point) => point[1])))
  const right = Math.min(1, Math.max(...points.map((point) => point[0])))
  const bottom = Math.min(1, Math.max(...points.map((point) => point[1])))
  if (right <= x || bottom <= y) {
    return null
  }
  return [
    crop[0] + x * crop[2],
    crop[1] + y * crop[3],
    (right - x) * crop[2],
    (bottom - y) * crop[3],
  ]
}
