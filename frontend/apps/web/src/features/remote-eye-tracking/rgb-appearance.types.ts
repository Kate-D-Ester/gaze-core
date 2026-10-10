import type { Point } from "./remote-eye-tracking.types"
import type { LayersModel, layers } from "@tensorflow/tfjs"

/** Borrowed layers: only the original model owns/disposes their variables. */
export type RgbAppearanceReadout = {
  encoder: LayersModel
  concatenate: layers.Layer
  dense: layers.Layer
  latent: layers.Layer
  output: layers.Layer
}

export type RgbAppearanceResult = {
  point: Point | null
  embedding: number[] | null
}
