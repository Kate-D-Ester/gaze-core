import type { Ellipse, Point } from "./eye-tracking.types"

export type DarkestPatch = {
  point: Point
  value: number
}

export type CvOwnedObject = {
  delete: () => void
}

export type PupilDetectionOptions = {
  thresholdMode?: "auto" | "manual"
  previous?: Ellipse | null
  previousSelected?: number
  includePreviewMasks?: boolean
  evaluateAllThresholds?: boolean
}

export type PupilCandidate = {
  score: number
  index: number
  points: Point[]
  refined: Point[]
  ellipse: Ellipse
}
