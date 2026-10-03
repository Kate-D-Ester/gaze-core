import { expect, test } from "bun:test"
import { SceneSelectionAdapter } from "../../apps/web/src/features/speaker-focus/scene-adapter"
import type { GazeMeasurement } from "../../apps/web/src/features/scene-eye-tracking/scene.types"
import type { FaceTrack } from "../../apps/web/src/features/speaker-focus/client.types"
const frame = (time: number, generation = 1) => ({
  id: time,
  timestamp: time,
  width: 320,
  height: 180,
  generation,
})
const gaze = (time: number): GazeMeasurement => ({
  timestamp: time,
  eyeId: time,
  sceneId: time,
  eyeTimestamp: time,
  sceneTimestamp: time,
  confidence: 1,
  position: [0.2, 0.2],
  pixels: [64, 36],
  valid: true,
  reason: "",
  extrapolated: false,
})
const tracks = (time: number): FaceTrack[] => [
  {
    id: "face",
    manual: false,
    observations: [{ timestamp: time / 1000, box: [0.1, 0.1, 0.2, 0.3] }],
  },
]
test("scene adapter requires the existing current accuracy check before gaze dwell", () => {
  const adapter = new SceneSelectionAdapter()
  for (let t = 1000; t <= 1600; t += 100) {
    adapter.observe({
      identity: "source",
      frame: frame(t),
      measurement: gaze(t),
      bubble: { center: [0.2, 0.2], radius: [0.02, 0.03], timestamp: t },
      verified: false,
      tracks: tracks(t),
      now: t,
    })
  }
  expect(adapter.state.selectedId).toBeNull()
  for (let t = 1700; t <= 2300; t += 100) {
    adapter.observe({
      identity: "source",
      frame: frame(t),
      measurement: gaze(t),
      bubble: { center: [0.2, 0.2], radius: [0.02, 0.03], timestamp: t },
      verified: true,
      tracks: tracks(t),
      now: t,
    })
  }
  expect(adapter.state.selectedId).toBe("face")
})
test("source or orientation identity changes clear the selected speaker", () => {
  const adapter = new SceneSelectionAdapter()
  adapter.observe({
    identity: "source",
    frame: frame(1000),
    measurement: null,
    verified: false,
    tracks: tracks(1000),
    now: 1000,
  })
  adapter.click([0.2, 0.2], 1000)
  expect(adapter.state.selectedId).toBe("face")
  adapter.observe({
    identity: "rotated",
    frame: frame(1100, 2),
    measurement: null,
    verified: false,
    tracks: tracks(1100),
    now: 1100,
  })
  expect(adapter.state.selectedId).toBeNull()
  expect(adapter.click([0.2, 0.2], 1500).selectedId).toBeNull()
})

test.each(["missing gaze", "unverified gaze", "stale scene"])(
  "%s interrupts switching dwell without dropping the current person",
  (interruption) => {
    const adapter = new SceneSelectionAdapter()
    const people = (time: number): FaceTrack[] => [
      ...tracks(time),
      {
        id: "other",
        manual: false,
        observations: [{ timestamp: time / 1000, box: [0.6, 0.1, 0.2, 0.3] }],
      },
    ]
    const input = (time: number) => ({
      identity: "source",
      frame: frame(time),
      measurement: { ...gaze(time), position: [0.7, 0.2] as [number, number] },
      bubble: {
        center: [0.7, 0.2] as [number, number],
        radius: [0.02, 0.03] as [number, number],
        timestamp: time,
      },
      verified: true,
      tracks: people(time),
      now: time,
    })
    adapter.observe(input(100))
    adapter.click([0.2, 0.2], 100)
    for (const time of [100, 200, 300]) {
      adapter.observe(input(time))
    }
    const dropped = input(350)
    adapter.observe({
      ...dropped,
      measurement: interruption === "missing gaze" ? null : dropped.measurement,
      verified: interruption !== "unverified gaze",
      frame: interruption === "stale scene" ? frame(100) : dropped.frame,
    })
    expect(adapter.state.selectedId).toBe("face")
    expect(adapter.state.pending).toBeNull()
    for (const time of [400, 500, 600]) {
      adapter.observe(input(time))
    }
    expect(adapter.state.selectedId).toBe("face")
    for (const time of [700, 800, 900]) {
      adapter.observe(input(time))
    }
    expect(adapter.state.selectedId).toBe("other")
  }
)
