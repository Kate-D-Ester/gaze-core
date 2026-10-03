import type { Box, FaceTrack } from "./client.types"

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
