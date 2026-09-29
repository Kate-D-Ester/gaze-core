import type { Ellipse, Point } from "./gaze-core.types"

export type RecentPupilFit = {
  key: string
  ellipse: Ellipse
  center: Point
  score: number
}

export type PupilFitSample = {
  ellipse: Ellipse
  center: Point
  score: number
}

export type PupilFitBucket = {
  count: number
  best: PupilFitSample
}

export type StablePupilFit = {
  ellipse: Ellipse | null
  center: Point | null
}
