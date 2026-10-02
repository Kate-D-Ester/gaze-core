import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import {
  loadRgbAppearanceModel,
  runRgbAppearanceModel,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-processor"

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
})
