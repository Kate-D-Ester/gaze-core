import type { HeadPose } from "./remote-eye-tracking.types"

export type FacePerspectiveInput = {
  pose: HeadPose
  /** Horizontal and vertical eye/canthus offsets for each observed eye. */
  offsets: readonly number[]
}
