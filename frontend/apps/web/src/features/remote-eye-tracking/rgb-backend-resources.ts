import * as tf from "@tensorflow/tfjs"

/** Called after selection warmup, before camera frames can create more tensors. */
export function releaseUnusedRgbBackends(model: tf.LayersModel) {
  for (const weight of model.weights) {
    // Clone migrates the variable to the active backend; dispose only the clone.
    tf.clone(weight.read()).dispose()
  }
  const engine = tf.engine()
  for (const name of ["wasm", "webgl", "cpu"]) {
    if (name === tf.getBackend()) {
      continue
    }
    // Inspect initialized instances only: findBackend can initialize an absent one.
    const backend = engine.registry[name]
    const registration = engine.registryFactory[name]
    if (!backend || !registration || backend.numDataIds() !== 0) {
      continue
    }
    // Released WebGL textures stay pooled until the unused backend is disposed.
    tf.removeBackend(name)
    tf.registerBackend(name, registration.factory, registration.priority)
  }
}
