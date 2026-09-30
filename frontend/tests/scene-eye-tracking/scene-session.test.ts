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

function handAt(id: number, time: number, x = 0.15, y = 0.15): HandObservation {
  return {
    scene: { id, timestamp: time, width: 640, height: 480, generation: 1 },
    landmarks: [Array.from({ length: 21 }, () => ({ x, y, z: 0 }))],
    worldLandmarks: [],
    handedness: ["Right"],
  }
}
test("intervening pupil loss and movement reset a hold before another hand arrives", () => {
  for (const interrupted of [null, [0.3, 0.3] as [number, number]]) {
    const s = new SceneSession()
    s.startCapture("calibration")
    for (let i = 1; i <= 15; i++) {
      s.addEye({
        id: i,
        timestamp: i * 50,
        feature: [-0.35, -0.35],
        confidence: 0.9,
        valid: true,
      })
      s.observeHand(handAt(i, i * 50), i * 50)
    }
    expect(s.getSnapshot().collection!.progress).toBeGreaterThan(0)
    s.addEye({
      id: 16,
      timestamp: 775,
      feature: interrupted,
      confidence: interrupted ? 0.9 : 0,
      valid: !!interrupted,
    })
    expect(s.getSnapshot().collection!.progress).toBe(0)
    for (let i = 17; i <= 26; i++) {
      s.addEye({
        id: i,
        timestamp: 800 + (i - 17) * 50,
        feature: [-0.35, -0.35],
        confidence: 0.9,
        valid: true,
      })
      s.observeHand(handAt(i, 800 + (i - 17) * 50), 800 + (i - 17) * 50)
    }
    expect(s.getSnapshot().collection!.holds).toHaveLength(0)
  }
})
test("repeated eye evidence keeps its original measurement without fresh trace or log samples", () => {
  const { s, id, time } = calibrate()
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0.1, 0.2],
    confidence: 0.9,
    valid: true,
  })
  s.measure(handAt(id + 1, time + 50).scene, time + 50)
  const original = s.getSnapshot().measurement
  const count = s.getSnapshot().trace.length
  s.measure(handAt(id + 2, time + 90).scene, time + 90)
  s.measure(handAt(id + 3, time + 130).scene, time + 130)
  expect(s.getSnapshot().measurement).toBe(original)
  expect(s.getSnapshot().trace).toHaveLength(count)
  s.measure(handAt(id + 4, time + 350).scene, time + 350)
  expect(s.getSnapshot().measurement!.valid).toBe(false)
})
test("eye arrival 200 to 500 ms after scene supports deferred calibration and live pairing", () => {
  for (const delay of [-200, -500]) {
    const s = new SceneSession()
    s.setDelay(delay)
    s.startCapture("calibration")
    const pending: { due: number; id: number; feature: [number, number] }[] = []
    let id = 0
    for (let now = 50; now <= 15000; now += 50) {
      const cell = Math.min(8, Math.floor((now - 50) / 1600))
      const x = [0.15, 0.5, 0.85][cell % 3],
        y = [0.15, 0.5, 0.85][Math.floor(cell / 3)]
      const hand = handAt(++id, now, x, y)
      s.observeHand(hand, now)
      pending.push({ due: now - delay, id, feature: [x - 0.5, y - 0.5] })
      while (pending[0]?.due <= now) {
        const eye = pending.shift()!
        s.addEye({
          id: eye.id,
          timestamp: eye.due,
          feature: eye.feature,
          confidence: 0.9,
          valid: true,
        })
      }
      s.measure(hand.scene, now)
      s.checkCaptureFreshness(now)
    }
    expect(s.getSnapshot().calibration).not.toBeNull()
    const m = s.getSnapshot().measurement!
    expect(m.valid).toBe(true)
    expect(m.eyeTimestamp! - m.sceneTimestamp!).toBe(-delay)
    expect(m.position![0]).toBeCloseTo(0.85, 6)
  }
})
