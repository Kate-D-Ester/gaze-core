import { expect, test } from "bun:test"
import { buildFacePerspectiveFeatures } from "../../apps/web/src/features/remote-eye-tracking/face-perspective"
import type { FacePerspectiveInput } from "../../apps/web/src/features/remote-eye-tracking/face-perspective.types"

const input: FacePerspectiveInput = {
  pose: {
    kind: "face",
    yaw: 0,
    pitch: 0,
    roll: 0,
    x: 0.55,
    y: 0.4,
    scale: 0.1,
  },
  offsets: [0.02, -0.01, 0.03, -0.02],
}

test("turning a fixed-distance inter-eye baseline does not introduce false distance", () => {
  // A unit baseline projected with focal length 1 at Z=10 spans 0.1 frontally.
  // A rotation with cosine 0.8 reduces that observed span to 0.08 at the same Z.
  const turned = buildFacePerspectiveFeatures({
    ...input,
    pose: { ...input.pose, yaw: Math.acos(0.8), scale: 0.08 },
  })!
  const expected = [10, 0.5, -1, 0.2, -0.1, 0.3, -0.2]
  for (const [index, value] of expected.entries()) {
    expect(turned[index]).toBeCloseTo(value, 10)
  }
  const frontal = buildFacePerspectiveFeatures(input)!
  expect(frontal[0]).toBeCloseTo(turned[0], 10)
  expect(turned[7]).toBeGreaterThan(frontal[7])
})

test("perspective terms retain each eye independently without moving the face origin", () => {
  const baseline = buildFacePerspectiveFeatures(input)!
  const changed = buildFacePerspectiveFeatures({
    ...input,
    offsets: [0.04, -0.03, 0.03, -0.02],
  })!
  expect(changed.slice(0, 3)).toEqual(baseline.slice(0, 3))
  expect(changed[3]).toBeCloseTo(0.4)
  expect(changed[4]).toBeCloseTo(-0.3)
  expect(changed.slice(5)).toEqual(baseline.slice(5))
})

test("pupil-only scale and missing binocular evidence cannot supply face perspective", () => {
  expect(
    buildFacePerspectiveFeatures({
      ...input,
      pose: { ...input.pose, kind: "eye-reference" },
    })
  ).toBeNull()
  expect(
    buildFacePerspectiveFeatures({ ...input, offsets: [0.02, 0] })
  ).toBeNull()
  expect(
    buildFacePerspectiveFeatures({ ...input, offsets: [0.02, 0, NaN, 0] })
  ).toBeNull()
})
