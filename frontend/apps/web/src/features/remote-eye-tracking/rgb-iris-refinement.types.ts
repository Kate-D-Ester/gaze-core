import type { Point } from "./remote-eye-tracking.types"

export type IrisBoundaryProposal = {
  center: Point
  radii: Point
  angle: number
  eyelid: Point[]
}

export type IrisBoundaryFit = {
  center: Point
  confidence: number
}

export type IrisBoundaryPoint = {
  x: number
  y: number
  contrast: number
}

export type IrisBoundaryCircle = {
  x: number
  y: number
  radius: number
}

export type RgbIrisRefinement = {
  version: string
  offsets: [number, number, number, number]
  confidence: [number, number]
}
