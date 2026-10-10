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

test("a head hold keeps collecting after its minimum until required motion is observed", () => {
  const collector = new TargetCollector([0.5, 0.5], 0, 0, {
    minimumSamples: 18,
    minimumDurationMs: 0,
    canComplete: (samples) =>
      samples.some((sample) => sample.observation.pose!.yaw! > 0.05),
  })
  for (let frame = 0; frame < 18; frame++) {
    const timestamp = 800 + frame * 100
    collector.add(observation(timestamp, 0), timestamp)
  }
  expect(collector.complete).toBe(false)
  expect(collector.add(observation(2700, 0.1), 2700)).toBe(true)
  expect(collector.complete).toBe(true)
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

test.each([3, 7, 30])(
  "comfortable hold uses elapsed time and unique frames at %p FPS",
  (fps) => {
    const collector = new TargetCollector([0.5, 0.5], 0, 0, {
      minimumSamples: 4,
      minimumDurationMs: 700,
    })
    const interval = 1000 / fps
    for (let timestamp = 700; timestamp < 1400; timestamp += interval) {
      collector.add(observation(timestamp, 0), timestamp)
      collector.add(observation(timestamp, 0), timestamp)
      expect(collector.complete).toBe(false)
    }
    for (
      let timestamp = 1400;
      timestamp < 2300 && !collector.complete;
      timestamp += interval
    )
      collector.add(observation(timestamp, 0), timestamp)
    expect(collector.complete).toBe(true)
    expect(
      collector.samples.at(-1)!.observation.timestamp -
        collector.samples[0]!.observation.timestamp
    ).toBeGreaterThanOrEqual(700)
  }
)

test("delayed 3 FPS inference retains a fixation while polling its accepted frame", () => {
  const collector = new TargetCollector([0.5, 0.5], 0, 0, {
    minimumSamples: 18,
    minimumDurationMs: 600,
    resetOnInvalid: true,
  })
  let latest: RemoteObservation | null = null
  for (let now = 1000; now < 10000 && !collector.complete; now += 16) {
    const timestamp = 700 + Math.floor((now - 1000) / 333) * 333
    if (latest?.timestamp !== timestamp) {
      latest = observation(timestamp, 0)
    }
    collector.add(latest, now)
  }
  expect(collector.complete).toBe(true)
  expect(collector.samples).toHaveLength(18)
})

test("a genuine frame outage or blink still resets an uninterrupted fixation", () => {
  const collector = new TargetCollector([0.5, 0.5], 0, 0, {
    minimumSamples: 18,
    minimumDurationMs: 600,
    resetOnInvalid: true,
  })
  const first = observation(800, 0)
  collector.add(first, 1100)
  collector.add(first, 1400)
  expect(collector.samples).toHaveLength(1)
  collector.add(first, 1801)
  expect(collector.samples).toHaveLength(0)
  collector.add(observation(1900, 0), 2200)
  collector.add({ ...observation(2300, 0), reason: "blink" }, 2400)
  expect(collector.samples).toHaveLength(0)
})
