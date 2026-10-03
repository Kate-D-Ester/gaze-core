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
