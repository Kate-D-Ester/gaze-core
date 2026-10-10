import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import {
  loadRgbAppearanceModel,
  runRgbAppearanceModel,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-processor"
import { releaseUnusedRgbBackends } from "../../apps/web/src/features/remote-eye-tracking/rgb-backend-resources"
import * as appearance from "../../apps/web/src/features/remote-eye-tracking/rgb-processor"

const assets = new URL(
  "../../apps/web/public/models/remote-eye-tracking/blazegaze/",
  import.meta.url
)

describe("bundled pretrained RGB appearance model", () => {
  test("loads actual weights and responds to eye-image appearance without leaking outputs", async () => {
    const tfPath = createRequire(
      new URL("../../apps/web/package.json", import.meta.url)
    ).resolve("@tensorflow/tfjs")
    const tf = await import(tfPath)
    await tf.setBackend("cpu")
    await tf.ready()
    const manifest = JSON.parse(
      await readFile(new URL("model.json", assets), "utf8")
    )
    const weights = await readFile(new URL("group1-shard1of1.bin", assets))
    const model = await loadRgbAppearanceModel({
      load: async () => ({
        modelTopology: manifest.modelTopology,
        weightSpecs: manifest.weightsManifest.flatMap(
          (group: { weights: unknown[] }) => group.weights
        ),
        weightData: weights.buffer.slice(
          weights.byteOffset,
          weights.byteOffset + weights.byteLength
        ),
      }),
    })
    const initialTensors = tf.memory().numTensors
    try {
      expect(typeof appearance.createRgbAppearanceReadout).toBe("function")
      const readout = appearance.createRgbAppearanceReadout(model)
      const data = new Uint8ClampedArray(128 * 512 * 4)
      const dark = await runRgbAppearanceModel(
        model,
        { width: 512, height: 128, data },
        [0, 0, -1],
        [0, 0, 60]
      )
      for (let i = 0; i < data.length; i += 4) {
        data[i] = (i / 4) % 256
        data[i + 1] = 160
        data[i + 2] = 220
        data[i + 3] = 255
      }
      const bright = await runRgbAppearanceModel(
        model,
        { width: 512, height: 128, data },
        [0, 0, -1],
        [0, 0, 60]
      )
      const rich = await appearance.runRgbAppearanceReadout(
        readout,
        { width: 512, height: 128, data },
        [0, 0, -1],
        [0, 0, 60]
      )
      expect(rich.point).toEqual(bright)
      expect(rich.embedding).toHaveLength(16)
      expect(rich.embedding!.every(Number.isFinite)).toBe(true)
      for (let frame = 0; frame < 3; frame++) {
        const repeated = await appearance.runRgbAppearanceReadout(
          readout,
          { width: 512, height: 128, data },
          [0, 0, -1],
          [0, 0, 60]
        )
        expect(repeated).toEqual(rich)
      }
      expect(tf.memory().numTensors).toBe(initialTensors)
      expect(dark).not.toBeNull()
      expect(bright).not.toBeNull()
      expect(dark!.every(Number.isFinite)).toBe(true)
      expect(bright!.every(Number.isFinite)).toBe(true)
      expect(
        Math.hypot(bright![0] - dark![0], bright![1] - dark![1])
      ).toBeGreaterThan(1e-5)
    } finally {
      model.dispose()
    }
  })

  test("backend cleanup preserves model variables and leaves backends reusable", async () => {
    const tfPath = createRequire(
      new URL("../../apps/web/package.json", import.meta.url)
    ).resolve("@tensorflow/tfjs")
    const tf = await import(tfPath)
    await tf.setBackend("cpu")
    await tf.ready()
    const factory = tf.findBackendFactory("cpu")!
    const original = tf.findBackendFactory("wasm")
    if (original) {
      tf.removeBackend("wasm")
    }
    tf.registerBackend("wasm", factory)
    await tf.setBackend("wasm")
    const previousBackend = tf.findBackend("wasm")!
    const model = tf.sequential({
      layers: [tf.layers.dense({ units: 1, inputShape: [1] })],
    })
    const weights = [tf.tensor2d([2], [1, 1]), tf.tensor1d([3])]
    model.setWeights(weights)
    weights.forEach((weight) => weight.dispose())
    const before = tf.memory().numTensors
    const retained = tf.tensor1d([7])
    try {
      await tf.setBackend("cpu")
      releaseUnusedRgbBackends(model)
      expect(previousBackend.numDataIds()).toBe(1)
      expect(tf.findBackend("wasm")).toBe(previousBackend)
      expect(Array.from(await retained.data())).toEqual([7])
      retained.dispose()
      releaseUnusedRgbBackends(model)
      expect(previousBackend.numDataIds()).toBe(0)
      expect(tf.findBackendFactory("wasm")).toBe(factory)
      const input = tf.tensor2d([4], [1, 1])
      const output = model.predict(input) as InstanceType<typeof tf.Tensor>
      expect(Array.from(await output.data())).toEqual([11])
      input.dispose()
      output.dispose()
      expect(tf.memory().numTensors).toBe(before)
      await tf.setBackend("wasm")
      expect(tf.findBackend("wasm")).not.toBe(previousBackend)
    } finally {
      retained.dispose()
      model.dispose()
      await tf.setBackend("cpu")
      tf.removeBackend("wasm")
      if (original) {
        tf.registerBackend("wasm", original)
      }
    }
  })
})
