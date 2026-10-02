import type { HeadMovement } from "./head-movement.types"
import type { HeadPose } from "./head-pose.types"
import { relativeHeadPose } from "./head-pose"

// Relative translation/depth and radians. Both sides of every degree of freedom are sampled.
export const HEAD_MOVEMENTS: HeadMovement[] = [
  {
    axis: 0,
    direction: 1,
    excursion: 0.055,
    instruction: "Shift sideways · keep looking at the dot",
  },
  {
    axis: 0,
    direction: -1,
    excursion: 0.055,
    instruction: "Shift to the other side · keep looking at the dot",
  },
  {
    axis: 1,
    direction: 1,
    excursion: 0.055,
    instruction: "Shift up or down · keep looking at the dot",
  },
  {
    axis: 1,
    direction: -1,
    excursion: 0.055,
    instruction: "Shift to the other height · keep looking at the dot",
  },
  {
    axis: 2,
    direction: 1,
    excursion: 0.09,
    instruction: "Move farther away · keep looking at the dot",
  },
  {
    axis: 2,
    direction: -1,
    excursion: 0.09,
    instruction: "Move nearer · keep looking at the dot",
  },
  {
    axis: 3,
    direction: 1,
    excursion: 0.12,
    instruction: "Nod slightly · keep looking at the dot",
  },
  {
    axis: 3,
    direction: -1,
    excursion: 0.12,
    instruction: "Nod the other way · keep looking at the dot",
  },
  {
    axis: 4,
    direction: 1,
    excursion: 0.12,
    instruction: "Turn slightly · keep looking at the dot",
  },
  {
    axis: 4,
    direction: -1,
    excursion: 0.12,
    instruction: "Turn the other way · keep looking at the dot",
  },
  {
    axis: 5,
    direction: 1,
    excursion: 0.12,
    instruction: "Tilt slightly · keep looking at the dot",
  },
  {
    axis: 5,
    direction: -1,
    excursion: 0.12,
    instruction: "Tilt the other way · keep looking at the dot",
  },
]

export function matchesHeadMovement(
  pose: HeadPose,
  reference: HeadPose,
  movement: HeadMovement
): boolean {
  const relative = relativeHeadPose(pose, reference)
  if (!relative) return false
  if (movement.direction === 0)
    return Math.abs(relative[movement.axis]) >= movement.excursion
  return movement.direction * relative[movement.axis] >= movement.excursion
}

export function isNeutralHeadPose(
  pose: HeadPose,
  reference: HeadPose
): boolean {
  const relative = relativeHeadPose(pose, reference)
  if (!relative) return false
  return relative.every(
    (value, axis) => Math.abs(value) < (axis < 3 ? 0.04 : 0.06)
  )
}
