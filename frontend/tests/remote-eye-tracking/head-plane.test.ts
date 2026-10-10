import { expect, test } from "bun:test"
import * as perspective from "../../apps/web/src/features/remote-eye-tracking/face-perspective"

test("head-plane normalization removes yaw/pitch shear from projected ocular offsets", () => {
  expect(typeof perspective.normalizeHeadPlaneEyeOffsets).toBe("function")
  const offset = [0.1, -0.05, -0.04, 0.08]
  for (const yaw of [-0.7, 0, 0.7]) {
    for (const pitch of [-0.45, 0, 0.45]) {
      for (const roll of [-0.35, 0, 0.35]) {
        const cy = Math.cos(yaw),
          sy = Math.sin(yaw)
        const cp = Math.cos(pitch),
          sp = Math.sin(pitch)
        const cr = Math.cos(roll),
          sr = Math.sin(roll)
        // Independent Rz Ry Rx projection, converting native Y up to image Y down.
        const horizontal = [cr * cy, -sr * cy]
        const vertical = [sr * cp - cr * sy * sp, cr * cp + sr * sy * sp]
        const span = Math.hypot(...horizontal)
        const projected: number[] = []
        for (let eye = 0; eye < 2; eye++) {
          const u = offset[eye * 2]!,
            v = offset[eye * 2 + 1]!
          const x = horizontal[0]! * u + vertical[0]! * v
          const y = horizontal[1]! * u + vertical[1]! * v
          projected.push(
            (x * horizontal[0]! + y * horizontal[1]!) / span ** 2,
            (-x * horizontal[1]! + y * horizontal[0]!) / span ** 2
          )
        }
        const restored = perspective.normalizeHeadPlaneEyeOffsets(
          projected,
          yaw,
          pitch
        )!
        restored.forEach((value, axis) =>
          expect(value).toBeCloseTo(offset[axis]!, 10)
        )
      }
    }
  }
})
