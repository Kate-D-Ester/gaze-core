import type { ImagePoint } from "./selection.types"

/** The rendered circle expressed in image coordinates; its two radii account for aspect ratio. */
export type SelectionBubble = {
  center: ImagePoint
  radius: ImagePoint
  timestamp: number
}
