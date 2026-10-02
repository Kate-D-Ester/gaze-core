import { expect, test } from "bun:test"
import { interpolateHeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-synchronization"
import {
  readHeadPose,
  synchronizedHeadPose,
} from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose"
import type { HeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose.types"

const pose: HeadPose = {
  id: 1,
  timestamp: 1000,
  position: [0, 0, -50],
  rotation: [0, 0, 0],
}

test("head pose is interpolated at the eye-frame time, not the newest camera time", () => {
  const next = {
    ...pose,
    id: 2,
    timestamp: 1040,
    position: [4, 0, -50],
    rotation: [0, 0.08, 0],
  } as HeadPose
  const paired = interpolateHeadPose([pose, next], 1020, 1050)
  expect(paired?.timestamp).toBe(1020)
  expect(paired?.position[0]).toBeCloseTo(2)
  expect(paired?.rotation[1]).toBeCloseTo(0.04)
})

test("missing brackets and long gaps cannot fabricate synchronized head poses", () => {
  expect(interpolateHeadPose([pose], 1040, 1050)).toBeNull()
  expect(
    interpolateHeadPose([pose, { ...pose, id: 2, timestamp: 1200 }], 1100, 1210)
  ).toBeNull()
  expect(interpolateHeadPose([pose], 1000, 1400)).toBeNull()
  expect(synchronizedHeadPose(pose, 1100, 1100)).toBeNull()
})

test("invalid face matrices cannot supply a mirrored or non-rigid head transform", () => {
  const reflected = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1]
  const sheared = [1, 0, 0, 0, 0.6, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1]
  expect(readHeadPose(reflected, 1, 1000)).toBeNull()
  expect(readHeadPose(sheared, 1, 1000)).toBeNull()
})
