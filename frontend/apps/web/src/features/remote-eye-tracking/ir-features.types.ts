import type { PupilTracker } from "../eye-tracking/pupil-tracker"

import type { Detection, Ellipse } from "../eye-tracking/eye-tracking.types"

import type { HeadPose, Point } from "./remote-eye-tracking.types"

export type IrEyeOptions = {
  polarity?: "auto" | "dark" | "bright"
  /** Maximum pupil major semiaxis, in crop pixels. */
  maxRadius?: number
  /** Restrict pupil centers to a maxRadius neighborhood (or one quarter crop diagonal). */
  expectedCenter?: Point
  /** Separate center travel from the maximum pupil size. */
  centerRadius?: number
  /** Visible opening from the current face landmarks, in crop coordinates. */
  centerRegion?: Point[]
  /** Recovery transforms must prove a fresh rim in the original pixels. */
  requireRawRim?: boolean
}

export type IrTrackingState = {
  pupils: PupilTracker
  polarity?: "dark" | "bright"
}

export type IrReference = {
  pupil: Ellipse
  glint: Point
  timestamp: number
  polarity?: "dark" | "bright"
}

export type IrEyeDetection = {
  pupil: Ellipse | null
  glint: Point | null
  quality: number
  reason: string | null
  reference: IrReference | null
}

export type Glint = { center: Point; quality: number; radius: number }

export type IrPupilCandidate = {
  pupil: Ellipse
  intensity: number
  bright: boolean
  detection: Detection
}

export type IrFeatureResult = {
  feature: number[]
  pose: HeadPose
  basePoint: Point
}
