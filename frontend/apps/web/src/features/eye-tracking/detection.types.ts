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
  expectedCenter?: Point
  previous?: Ellipse | null
  previousAgeMs?: number
  /** Last independently detected shape; limits gradual drift during rim tracking. */
  trackingAnchor?: Ellipse | null
  previousSelected?: number
  includePreviewMasks?: boolean
}

export type PupilBoundaryEvidence = {
  support: number
  contrast: number
}

export type PupilRimSample = {
  point: Point
  normal: Point
  offset: number
}

export type PupilProposal = {
  index: number
  points: Point[]
  refined: Point[]
  ellipse: Ellipse
  area: number
  quality: number
}

export type PupilContourRegion = {
  index: number
  area: number
  priority: number
}

export type PupilCandidate = {
  shapeObserved?: boolean
  score: number
  index: number
  points: Point[]
  refined: Point[]
  ellipse: Ellipse
}
