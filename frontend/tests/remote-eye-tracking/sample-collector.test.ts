import { expect, test } from "bun:test"
import { TargetCollector } from "../../apps/web/src/features/remote-eye-tracking/sample-collector"
import type { RemoteObservation } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
function observation(timestamp: number, head: number): RemoteObservation {
  return {
    timestamp,
    width: 640,
    height: 480,
    feature: [0.1, 0.2, head],
    quality: 0.9,
    reason: null,
    eyes: [],
    faceBox: null,
    basePoint: null,
    pose: {
      kind: "face",
      yaw: head,
      pitch: 0,
      roll: 0,
      x: 0.5,
      y: 0.5,
      scale: 0.2,
    },
    method: "test",
    processingMs: 10,
  }
}
test("only fresh post-settle frames are recorded once, preserving per-frame head pose", () => {
  const collector = new TargetCollector([0.1, 0.9], 2, 100)
  expect(collector.add(observation(600, 0), 600)).toBe(false)
  expect(collector.add(observation(800, 0.1), 800)).toBe(true)
  expect(collector.add(observation(800, 0.2), 850)).toBe(false)
  expect(collector.add(observation(900, -0.1), 900)).toBe(true)
  expect(collector.add(observation(1000, 0), 2000)).toBe(false)
  expect(collector.samples.map((s) => s.observation.pose?.yaw)).toEqual([
    0.1, -0.1,
  ])
})
test("blinks and invalid frames do not advance a target; sufficient valid samples do", () => {
  const collector = new TargetCollector([0.5, 0.5], 0, 0)
  expect(
    collector.add(
      { ...observation(800, 0), reason: "blink", feature: null },
      800
    )
  ).toBe(false)
  for (let i = 0; i < 18; i++)
    collector.add(
      observation(900 + i * 100, i % 2 ? 0.08 : -0.08),
      900 + i * 100
    )
  expect(collector.complete).toBe(true)
  expect(collector.samples).toHaveLength(18)
})

test("unlabeled recorded observations cannot train or validate screen calibration", () => {
  const collector = new TargetCollector([0.5, 0.5], 0, 0)
  expect(
    collector.add({ ...observation(800, 0.1), source: "video" }, 800)
  ).toBe(false)
  expect(collector.samples).toHaveLength(0)
  expect(
    collector.add({ ...observation(900, 0.1), source: "camera" }, 900)
  ).toBe(true)
})
