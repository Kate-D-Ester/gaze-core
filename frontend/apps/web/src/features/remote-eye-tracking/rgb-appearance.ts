import * as tf from "@tensorflow/tfjs"
import { modelPredictionToScreen } from "./rgb-features"
import type { RgbPixels } from "./rgb-features.types"
import type {
  RgbAppearanceReadout,
  RgbAppearanceResult,
} from "./rgb-appearance.types"

import { RGB_EMBEDDING_SIZE } from "./rgb-model-version"
export { RGB_EMBEDDING_VERSION } from "./rgb-model-version"

/** Share the existing encoder and weights; expose head-conditioned features before Dense2. */
export function createRgbAppearanceReadout(
  model: tf.LayersModel
): RgbAppearanceReadout {
  const encoder = model.getLayer("cnn_encoder") as tf.LayersModel
  const head = model.getLayer("gaze_mlp") as tf.LayersModel
  const latent = head.getLayer("dense_1").output as tf.SymbolicTensor
  if (latent.shape.length !== 2 || latent.shape[1] !== RGB_EMBEDDING_SIZE) {
    throw new Error(
      "The RGB model has an incompatible appearance representation"
    )
  }
  return {
    encoder,
    concatenate: head.getLayer("feature_concat"),
    dense: head.getLayer("dense"),
    latent: head.getLayer("dense_1"),
    output: head.getLayer("gaze_output"),
  }
}

/** One shared forward graph, one compact readback, no retained per-frame tensors. */
export async function runRgbAppearanceReadout(
  model: tf.LayersModel | RgbAppearanceReadout,
  patch: RgbPixels,
  headVector: [number, number, number],
  faceOrigin: [number, number, number]
): Promise<RgbAppearanceResult> {
  if (
    patch.width !== 512 ||
    patch.height !== 128 ||
    patch.data.length !== 512 * 128 * 4 ||
    ![...headVector, ...faceOrigin].every(Number.isFinite)
  ) {
    throw new Error("Invalid RGB appearance input")
  }
  const output = tf.tidy(() => {
    const pixels = {
      ...patch,
      data: new Uint8Array(
        patch.data.buffer,
        patch.data.byteOffset,
        patch.data.byteLength
      ),
    }
    const image = tf.browser
      .fromPixels(pixels, 3)
      .toFloat()
      .div(255)
      .expandDims(0)
    const head = tf.tensor2d(headVector, [1, 3])
    const origin = tf.tensor2d(faceOrigin, [1, 3])
    if ("encoder" in model) {
      const encoded = model.encoder.predict(image) as tf.Tensor
      const combined = model.concatenate.apply([
        encoded,
        head,
        origin,
      ]) as tf.Tensor
      const hidden = model.dense.apply(combined) as tf.Tensor
      const embedding = model.latent.apply(hidden) as tf.Tensor
      const point = model.output.apply(embedding) as tf.Tensor
      return tf.concat([point, embedding], 1)
    }
    const prediction = model.predict([image, head, origin])
    const tensors = Array.isArray(prediction) ? prediction : [prediction]
    return tf.concat(tensors, 1)
  })
  try {
    const values = await output.data()
    const point = modelPredictionToScreen(values.slice(0, 2))
    let embedding: number[] | null = null
    if (values.length === RGB_EMBEDDING_SIZE + 2) {
      const candidate = Array.from(values.slice(2))
      if (candidate.every(Number.isFinite)) {
        embedding = candidate
      }
    }
    return { point, embedding }
  } finally {
    output.dispose()
  }
}
