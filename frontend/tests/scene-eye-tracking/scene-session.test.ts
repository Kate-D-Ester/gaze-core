import { expect, test } from "bun:test"
import { SceneSession } from "../../apps/web/src/features/scene-eye-tracking/scene-session"
import type {
  SceneObservation,
  HandObservation,
} from "../../apps/web/src/features/scene-eye-tracking/scene.types"

function calibrate() {
  const s = new SceneSession()
  s.startCapture("calibration")
  let id = 0,
    time = 0
  for (let cell = 0; cell < 9; cell++)
    for (let i = 0; i < 30; i++) {
      id++
      time += 50
      const x = [0.15, 0.5, 0.85][cell % 3],
        y = [0.15, 0.5, 0.85][Math.floor(cell / 3)]
      s.addEye({
        id,
        timestamp: time,
        feature: [x - 0.5, y - 0.5],
        confidence: 0.9,
        valid: true,
      })
      const scene = {
        id,
        timestamp: time,
        width: 640,
        height: 480,
        generation: 1,
      }
      const hand: HandObservation = {
        scene,
        landmarks: [Array.from({ length: 21 }, () => ({ x, y, z: 0 }))],
        worldLandmarks: [],
        handedness: ["Right"],
      }
      s.observeHand(hand, time)
    }
  return { s, id, time }
}
test("live scene gaze remains available without a hand after calibration", () => {
  const { s, id, time } = calibrate()
  expect(s.getSnapshot().calibration).not.toBeNull()
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0.1, 0.2],
    confidence: 0.9,
    valid: true,
  })
  const scene: SceneObservation = {
    id: id + 1,
    timestamp: time + 50,
    width: 640,
    height: 480,
    generation: 1,
  }
  s.observeHand(
    { scene, landmarks: [], worldLandmarks: [], handedness: [] },
    time + 50
  )
  s.measure(scene, time + 50)
  const m = s.getSnapshot().measurement!
  expect(m.valid).toBe(true)
  expect(m.position![0]).toBeCloseTo(0.6, 7)
  expect(m.pixels![1]).toBeCloseTo(336, 7)
  s.measure(scene, time + 350)
  expect(s.getSnapshot().measurement?.valid).toBe(false)
})
test("pupil loss suppresses a previously mapped dot and logs its reason", () => {
  const { s, id, time } = calibrate()
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: null,
    confidence: 0,
    valid: false,
  })
  s.measure(
    {
      id: id + 1,
      timestamp: time + 50,
      width: 640,
      height: 480,
      generation: 1,
    },
    time + 50
  )
  expect(s.getSnapshot().measurement?.position).toBeNull()
  expect(s.getSnapshot().measurement?.reason).toContain("pupil")
})
test("source/settings invalidation and delay changes discard calibration and pending capture", () => {
  const { s } = calibrate()
  s.invalidate("Eye setup changed")
  expect(s.getSnapshot().calibration).toBeNull()
  expect(s.getSnapshot().notice).toContain("Eye setup changed")
  s.startCapture("calibration")
  s.setDelay(100)
  expect(s.getSnapshot().capture).toBeNull()
  expect(s.getSnapshot().calibration).toBeNull()
})
test("camera-image mapping does not depend on viewport dimensions", () => {
  const { s, id, time } = calibrate()
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0, 0],
    confidence: 0.9,
    valid: true,
  })
  s.measure(
    {
      id: id + 1,
      timestamp: time + 50,
      width: 1280,
      height: 720,
      generation: 1,
    },
    time + 50
  )
  expect(s.getSnapshot().measurement!.position![0]).toBeCloseTo(0.5, 7)
  expect(s.getSnapshot().measurement!.pixels![0]).toBeCloseTo(640, 7)
})

test("nonfinite confidence and camera dimensions cannot produce live valid gaze", () => {
  const { s, id, time } = calibrate()
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0, 0],
    confidence: NaN,
    valid: true,
  })
  s.measure(
    {
      id: id + 1,
      timestamp: time + 50,
      width: 640,
      height: 480,
      generation: 1,
    },
    time + 50
  )
  expect(s.getSnapshot().measurement?.valid).toBe(false)
})
