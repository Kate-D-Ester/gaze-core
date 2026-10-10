import type { RgbPhysicalModel } from "./rgb-features.types"

export type RgbGeometryHistory = {
  model: RgbPhysicalModel
  width: number
  height: number
  timestamp: number
}

export type RgbGeometryFrame = {
  width: number
  height: number
  timestamp: number
  reason: string | null
}
