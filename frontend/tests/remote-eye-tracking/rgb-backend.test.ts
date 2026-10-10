import { expect, test } from "bun:test"
import { selectRgbBackend } from "../../apps/web/src/features/remote-eye-tracking/rgb-backend"
import type {
  RgbBackend,
  RgbBackendProbe,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-backend.types"
import type { Point } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

function hardwareProbe(
  durations: Partial<Record<RgbBackend, number[]>>,
  predictions: Partial<Record<RgbBackend, Point | null>> = {}
) {
  let active: RgbBackend = "cpu"
  let clock = 0
  const calls: Partial<Record<RgbBackend, number>> = {}
  const probe: RgbBackendProbe = {
    activate: async (backend) => {
      if (!durations[backend]) {
        return false
      }
      active = backend
      return true
    },
    predict: async (sample) => {
      const index = calls[active] ?? 0
      calls[active] = index + 1
      clock += durations[active]![index] ?? 10
      if (active in predictions) {
        return predictions[active] ?? null
      }
      return [0.4 + sample * 0.1, 0.6]
    },
    now: () => clock,
  }
  return { probe, active: () => active }
}

test("selects faster actual inference after excluding shader warmup", async () => {
  const hardware = hardwareProbe({
    wasm: [10, 100, 120],
    webgl: [1200, 20, 22],
  })
  expect(await selectRgbBackend("wasm", hardware.probe)).toBe("webgl")
  expect(hardware.active()).toBe("webgl")
})

test("keeps the preferred backend when timings differ only slightly", async () => {
  const hardware = hardwareProbe({ wasm: [10, 20, 20], webgl: [10, 19, 19] })
  expect(await selectRgbBackend("wasm", hardware.probe)).toBe("wasm")
  expect(hardware.active()).toBe("wasm")
})

test("rejects a fast backend whose predictions disagree with the reference", async () => {
  const hardware = hardwareProbe(
    { wasm: [10, 100, 100], webgl: [10, 1, 1] },
    { webgl: [0.9, 0.1] }
  )
  expect(await selectRgbBackend("wasm", hardware.probe)).toBe("wasm")
  expect(hardware.active()).toBe("wasm")
})

test("unavailable or invalid accelerators retain the working CPU fallback", async () => {
  const hardware = hardwareProbe(
    { webgl: [1, 1, 1], cpu: [10, 200, 200] },
    { webgl: [NaN, 0.5] }
  )
  expect(await selectRgbBackend("cpu", hardware.probe)).toBe("cpu")
  expect(hardware.active()).toBe("cpu")
})

test("does not report a backend when inference fails everywhere", async () => {
  const hardware = hardwareProbe({ wasm: [1, 1, 1] }, { wasm: null })
  await expect(selectRgbBackend("wasm", hardware.probe)).rejects.toThrow()
})

test("tries CPU if an available accelerator fails during actual inference", async () => {
  const hardware = hardwareProbe(
    { wasm: [1, 1, 1], cpu: [10, 200, 200] },
    { wasm: null }
  )
  expect(await selectRgbBackend("wasm", hardware.probe)).toBe("cpu")
})

test("restores another measured backend if the faster backend becomes unavailable", async () => {
  const hardware = hardwareProbe({ wasm: [10, 10, 10], webgl: [10, 40, 40] })
  const activate = hardware.probe.activate
  let wasmActivations = 0
  hardware.probe.activate = async (backend) => {
    if (backend === "wasm" && ++wasmActivations > 1) {
      return false
    }
    return activate(backend)
  }
  expect(await selectRgbBackend("wasm", hardware.probe)).toBe("webgl")
  expect(hardware.active()).toBe("webgl")
})
