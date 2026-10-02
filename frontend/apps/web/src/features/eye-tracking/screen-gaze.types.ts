import type { Point } from "./eye-tracking.types"

export type ScreenGazeReading = {
  point: Point | null
  status:
    | "not-calibrated"
    | "eye-lost"
    | "head-lost"
    | "head-outside-range"
    | "outside-screen"
    | "tracking"
  message: string
}
