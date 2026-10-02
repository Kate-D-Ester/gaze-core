import type { Point } from "./eye-tracking.types"

export type AffineCoefficients = [number[], number[]]
export type MappingSample = { feature: Point; target: Point }
