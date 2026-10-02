import { expect, test } from "bun:test"
import { SceneSession } from "../../apps/web/src/features/scene-eye-tracking/scene-session"
import {
  CALIBRATION_TARGETS,
  VALIDATION_TARGETS,
} from "../../apps/web/src/features/scene-eye-tracking/calibration"
import type {
  SceneObservation,
  HandObservation,
} from "../../apps/web/src/features/scene-eye-tracking/scene.types"
import {
  createSessionLog,
  appendMeasurement,
  exportSessionCsv,
} from "../../apps/web/src/features/scene-eye-tracking/session"

import { calibrate, collectValidation } from "./fixtures"
test("a failed check retains a fresh unverified gaze preview but cannot mark it valid or hide pupil loss", () => {
  const { s, id } = calibrate(false)
  const collected = collectValidation(s, id, () => [0.06, -0.04])
  expect(s.getSnapshot().validation?.passed).toBe(false)
  expect(s.getSnapshot().notice).toContain("px RMS")
  expect(s.getSnapshot().notice).not.toContain(
    "Recalibrate at your working distance"
  )
  s.addEye({
    id: collected.id + 1,
    timestamp: collected.time + 50,
    feature: [0.06, -0.04],
    confidence: 0.95,
    valid: true,
  })
  s.measure(
    handAt(collected.id + 1, collected.time + 50).scene,
    collected.time + 50
  )
  expect(s.getSnapshot().measurement?.position![0]).toBeCloseTo(0.56)
  expect(s.getSnapshot().measurement?.preview).toBe(true)
  expect(s.getSnapshot().measurement?.valid).toBe(false)
  s.addEye({
    id: collected.id + 2,
    timestamp: collected.time + 100,
    feature: null,
    confidence: 0,
    valid: false,
  })
  s.measure(
    handAt(collected.id + 2, collected.time + 100).scene,
    collected.time + 100
  )
  expect(s.getSnapshot().measurement?.position).toBeNull()
  expect(s.getSnapshot().measurement?.preview).toBe(false)
})
test("an isolated validation failure repeats one fresh hold while keeping the nine-point mapping and four good checks", () => {
  const { s, id } = calibrate(false)
  const mapping = s.getSnapshot().calibration
  const collected = collectValidation(s, id, (index) =>
    index === 2 ? [0.14, 0] : [0, 0]
  )
  expect(s.getSnapshot().validation?.passed).toBe(false)
  expect(s.getSnapshot().validation?.retryIndex).toBe(2)
  s.retryValidationPoint()
  expect(s.getSnapshot().calibration).toBe(mapping)
  expect(s.getSnapshot().capture).toBe("validation")
  expect(s.getSnapshot().collection?.holds).toHaveLength(4)
  expect(s.getSnapshot().collection?.target).toEqual(VALIDATION_TARGETS[2])
  collectValidation(s, collected.id, () => [0, 0], [VALIDATION_TARGETS[2]])
  expect(s.getSnapshot().validation?.passed).toBe(true)
  expect(s.getSnapshot().calibration).toBe(mapping)
})
test("a fitted mapping remains untrusted until the independent validation passes", () => {
  const { s, id, time } = calibrate(false)
  expect(s.getSnapshot().calibration).not.toBeNull()
  expect(s.getSnapshot().capture).toBe("validation")
  s.measure(handAt(id, time).scene, time)
  expect(s.getSnapshot().measurement?.valid).toBe(false)
})
test("changing offset prevents a single-point retry from reusing validation points that supplied the correction", () => {
  const { s, id } = calibrate(false)
  collectValidation(s, id, (index) => (index === 2 ? [0.14, 0] : [0, 0]))
  s.setOffset([0.01, 0])
  s.retryValidationPoint()
  expect(s.getSnapshot().capture).toBeNull()
  expect(s.getSnapshot().validation?.passed).toBe(false)
})
test("an inconsistent fit offers an explicit retry without looping and retains eight points when chosen", () => {
  const s = new SceneSession()
  const completed = new Set<unknown>()
  s.subscribe(() => {
    const c = s.getSnapshot().collection
    if (c?.status === "saved") completed.add(c.holds.at(-1))
  })
  s.startCapture("calibration")
  let id = 0
  for (const [index, [x, y]] of CALIBRATION_TARGETS.entries())
    for (let frame = 0; frame < 35; frame++) {
      id++
      s.addEye({
        id,
        timestamp: id * 50,
        feature: [x - 0.5 + (index === 1 ? 0.2 : 0), y - 0.5],
        confidence: 0.95,
        valid: true,
      })
      s.observeHand(handAt(id, id * 50, x, y), id * 50)
      if (s.getSnapshot().collection?.canLock) s.lockPoint()
    }
  expect(s.getSnapshot().capture).toBeNull()
  expect(s.getSnapshot().fitFailure).not.toBeNull()
  expect(completed.size).toBe(9)
  s.retryCalibrationPoint()
  expect(s.getSnapshot().capture).toBe("calibration")
  expect(s.getSnapshot().collection!.holds).toHaveLength(8)
  expect(s.getSnapshot().collection!.target).toEqual([0.15, 0.15])
  expect(s.getSnapshot().notice.toLowerCase()).toContain("top left")
  for (let frame = 0; frame < 35; frame++) {
    id++
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [-0.35, -0.35],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50, 0.15, 0.15), id * 50)
    if (s.getSnapshot().collection?.canLock) s.lockPoint()
  }
  expect(s.getSnapshot().calibration).not.toBeNull()
  expect(s.getSnapshot().capture).toBe("validation")
})
test("collapsed gaze data gives an eye-model diagnosis instead of blaming fingertip fixation", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  let id = 0
  for (const [x, y] of CALIBRATION_TARGETS)
    for (let frame = 0; frame < 35; frame++) {
      id++
      s.addEye({
        id,
        timestamp: id * 50,
        feature: [0, 0],
        confidence: 0.95,
        valid: true,
      })
      s.observeHand(handAt(id, id * 50, x, y), id * 50)
      if (s.getSnapshot().collection?.canLock) s.lockPoint()
    }
  expect(s.getSnapshot().calibration).toBeNull()
  expect(s.getSnapshot().notice).toMatch(/eye model/i)
})
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
test("post-calibration X/Y offsets shift live and exported coordinates without changing the fitted mapping", () => {
  const { s, id, time } = calibrate()
  const calibration = s.getSnapshot().calibration
  s.setOffset([16 / 640, -12 / 480])
  expect(s.getSnapshot().calibration).toBe(calibration)
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0.1, 0.2],
    confidence: 0.9,
    valid: true,
  })
  s.measure(handAt(id + 1, time + 50).scene, time + 50)
  const measurement = s.getSnapshot().measurement!
  expect(measurement.position![0]).toBeCloseTo(0.625)
  expect(measurement.position![1]).toBeCloseTo(0.675)
  expect(measurement.pixels![0]).toBeCloseTo(400)
  expect(measurement.pixels![1]).toBeCloseTo(324)
  expect(measurement.valid).toBe(false)
  expect(measurement.preview).toBe(true)
  expect(s.getSnapshot().validation?.passed).toBe(true)
  const log = createSessionLog(time, { gazeOffset: s.getSnapshot().offset })
  appendMeasurement(log, measurement)
  const exported = exportSessionCsv(log).split("\n")[1].split(",")
  expect(Number(exported[9])).toBeCloseTo(400)
  expect(Number(exported[10])).toBeCloseTo(324)
})
test("offset edits clear the old trace and reset on a new calibration or source setup", () => {
  const { s, id, time } = calibrate()
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0, 0],
    confidence: 0.9,
    valid: true,
  })
  s.measure(handAt(id + 1, time + 50).scene, time + 50)
  expect(s.getSnapshot().trace.length).toBeGreaterThan(0)
  s.setOffset([0.01, 0.02])
  expect(s.getSnapshot().trace).toEqual([])
  expect(s.getSnapshot().measurement).toBeNull()
  expect(s.getSnapshot().notice).toBe("")
  s.startCapture("calibration")
  expect(s.getSnapshot().offset).toEqual([0, 0])
  const fitted = calibrate().s
  fitted.setOffset([0.01, 0.02])
  fitted.invalidate()
  expect(fitted.getSnapshot().offset).toEqual([0, 0])
})
test("offsets cannot admit corrupt input, bypass validation, or hide an out-of-view gaze", () => {
  const { s, id, time } = calibrate()
  s.setOffset([NaN, 0])
  s.setOffset([2, 0])
  expect(s.getSnapshot().offset).toEqual([0, 0])
  s.setOffset([0.8, 0])
  s.addEye({
    id: id + 1,
    timestamp: time + 50,
    feature: [0, 0],
    confidence: 0.9,
    valid: true,
  })
  s.measure(handAt(id + 1, time + 50).scene, time + 50)
  expect(s.getSnapshot().measurement?.position![0]).toBeCloseTo(1.3)
  expect(s.getSnapshot().measurement?.valid).toBe(false)
  const unchecked = calibrate(false)
  unchecked.s.setOffset([0.1, 0.1])
  expect(unchecked.s.getSnapshot().offset).toEqual([0, 0])
  unchecked.s.measure(
    handAt(unchecked.id, unchecked.time).scene,
    unchecked.time
  )
  expect(unchecked.s.getSnapshot().measurement?.valid).toBe(false)
})
test("fresh validation measures the corrected mapping at its current offset", () => {
  const { s, id } = calibrate()
  s.setOffset([0.01, -0.01])
  s.startCapture("validation")
  let next = id
  for (const [x, y] of VALIDATION_TARGETS)
    for (let frame = 0; frame < 35; frame++) {
      next++
      s.addEye({
        id: next,
        timestamp: next * 50,
        feature: [x - 0.5, y - 0.5],
        confidence: 0.9,
        valid: true,
      })
      s.observeHand(handAt(next, next * 50, x, y), next * 50)
      if (s.getSnapshot().collection?.canLock) s.lockPoint()
    }
  expect(s.getSnapshot().offset).toEqual([0.01, -0.01])
  expect(s.getSnapshot().validation?.offset).toEqual([0.01, -0.01])
  expect(s.getSnapshot().validation?.pixelRms).toBeCloseTo(8)
  expect(s.getSnapshot().validation?.passed).toBe(true)
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

function handAt(id: number, time: number, x = 0.5, y = 0.5): HandObservation {
  return {
    scene: { id, timestamp: time, width: 640, height: 480, generation: 1 },
    landmarks: [Array.from({ length: 21 }, () => ({ x, y, z: 0 }))],
    worldLandmarks: [],
    handedness: ["Right"],
  }
}
test("a network hand reacquisition gap pauses the point without losing good samples or counting the gap", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  for (let id = 1; id <= 12; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
    if (id === 1) s.lockPoint()
  }
  const progress = s.getSnapshot().collection!.progress
  expect(progress).toBeGreaterThan(0)
  for (let id = 13; id <= 24; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand({ ...handAt(id, id * 50), landmarks: [] }, id * 50)
    s.checkCaptureFreshness(id * 50)
  }
  expect(s.getSnapshot().collection!.progress).toBe(progress)
  expect(s.getSnapshot().collection!.status).toBe("paused")
  expect(s.getSnapshot().collection!.samples).toBeGreaterThan(0)
  expect(s.getSnapshot().capture).toBe("calibration")
  for (let id = 25; id <= 32; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
  }
  expect(s.getSnapshot().collection!.holds).toHaveLength(0)
  for (let id = 33; id <= 46; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
  }
  const hold = s.getSnapshot().collection!.holds[0]
  expect(hold).toBeDefined()
  expect(
    hold.pairs.every((pair) => pair.sceneId <= 12 || pair.sceneId >= 25)
  ).toBe(true)
})
test("an isolated weak pupil frame during hand recovery does not erase the point", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  for (let id = 1; id <= 12; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
    if (id === 1) s.lockPoint()
  }
  const samples = s.getSnapshot().collection!.samples
  for (let id = 13; id <= 26; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: id === 24 ? 0.68 : 0.95,
      valid: true,
    })
    s.observeHand({ ...handAt(id, id * 50), landmarks: [] }, id * 50)
    s.checkCaptureFreshness(id * 50)
  }
  expect(s.getSnapshot().collection!.samples).toBe(samples)
  for (let id = 27; id <= 48; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
  }
  expect(s.getSnapshot().collection!.holds).toHaveLength(1)
})
test("long hand loss and actual eye interruption discard an unfinished point", () => {
  for (const interrupt of [
    "long-hand",
    "blink",
    "gaze-moved",
    "weak-pupil",
  ] as const) {
    const s = new SceneSession()
    s.startCapture("calibration")
    for (let id = 1; id <= 12; id++) {
      s.addEye({
        id,
        timestamp: id * 50,
        feature: [0, 0],
        confidence: 0.95,
        valid: true,
      })
      s.observeHand(handAt(id, id * 50), id * 50)
      if (id === 1) s.lockPoint()
    }
    expect(s.getSnapshot().collection!.samples).toBeGreaterThan(0)
    const end = interrupt === "long-hand" ? 74 : 24
    for (let id = 13; id <= end; id++) {
      s.addEye({
        id,
        timestamp: id * 50,
        feature:
          interrupt === "blink"
            ? null
            : interrupt === "gaze-moved"
              ? [0.3, 0.3]
              : [0, 0],
        confidence: interrupt === "weak-pupil" ? 0.68 : 0.95,
        valid: interrupt !== "blink",
      })
      s.observeHand({ ...handAt(id, id * 50), landmarks: [] }, id * 50)
      s.checkCaptureFreshness(id * 50)
    }
    expect(s.getSnapshot().collection!.samples).toBe(0)
    expect(s.getSnapshot().collection!.holds).toHaveLength(0)
  }
})
test("the 2.7 second replay gap preserves samples but cannot finish a point on missing frames", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  for (let id = 1; id <= 12; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
    if (id === 1) s.lockPoint()
  }
  const samples = s.getSnapshot().collection!.samples
  for (let id = 13; id <= 66; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand({ ...handAt(id, id * 50), landmarks: [] }, id * 50)
    s.checkCaptureFreshness(id * 50)
  }
  expect(s.getSnapshot().collection!.samples).toBe(samples)
  expect(s.getSnapshot().collection!.holds).toHaveLength(0)
  for (let id = 67; id <= 90; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
  }
  expect(s.getSnapshot().collection!.holds).toHaveLength(1)
  expect(
    s
      .getSnapshot()
      .collection!.holds[0].pairs.every(
        (p) => p.sceneId <= 12 || p.sceneId >= 67
      )
  ).toBe(true)
})
test("eye frame silence during hand recovery cannot preserve an unobserved gaze hold", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  for (let id = 1; id <= 12; id++) {
    s.addEye({
      id,
      timestamp: id * 50,
      feature: [0, 0],
      confidence: 0.95,
      valid: true,
    })
    s.observeHand(handAt(id, id * 50), id * 50)
    if (id === 1) s.lockPoint()
  }
  for (let id = 13; id <= 24; id++) {
    s.observeHand({ ...handAt(id, id * 50), landmarks: [] }, id * 50)
    s.checkCaptureFreshness(id * 50)
  }
  expect(s.getSnapshot().collection!.samples).toBe(0)
})
test("intermittent missed hand detections finish a hold using only observed pairs", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  for (let id = 1; id <= 50; id++) {
    const time = id * 50
    s.addEye({
      id,
      timestamp: time,
      feature: [0, 0],
      confidence: 0.9,
      valid: true,
    })
    const hand = handAt(id, time)
    if (id % 4 === 0) hand.landmarks = []
    s.observeHand(hand, time)
    s.checkCaptureFreshness(time)
    if (s.getSnapshot().collection?.canLock) s.lockPoint()
  }
  const hold = s.getSnapshot().collection!.holds[0]
  expect(s.getSnapshot().collection!.holds).toHaveLength(1)
  expect(hold.pairs.every((p) => p.sceneId % 4 !== 0)).toBe(true)
})
test("brief weak pupil frames pause capture without erasing a stable hold", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  for (let id = 1; id <= 55; id++) {
    const time = id * 50
    s.addEye({
      id,
      timestamp: time,
      feature: [0, 0],
      confidence: id % 5 === 0 ? 0.68 : 0.9,
      valid: true,
    })
    s.observeHand(handAt(id, time), time)
    s.checkCaptureFreshness(time)
    if (s.getSnapshot().collection?.canLock) s.lockPoint()
  }
  const collection = s.getSnapshot().collection!
  expect(collection.holds).toHaveLength(1)
  expect(collection.holds[0].pairs.every((p) => p.eyeId % 5 !== 0)).toBe(true)
})
test("a top corner captures with angular jitter and brief confidence dips", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  let id = 0
  for (const [x, y] of [
    [0.5, 0.5],
    [0.15, 0.15],
  ]) {
    const gazeX = (x - 0.5) * 3.4,
      gazeY = (y - 0.5) * 3.4
    for (let frame = 0; frame < 65; frame++) {
      id++
      const time = id * 50,
        angle = id % 2 ? 0.007 : -0.007
      const cosine = Math.cos(angle),
        sine = Math.sin(angle)
      s.addEye({
        id,
        timestamp: time,
        feature: [
          (gazeX * cosine - sine) / (gazeX * sine + cosine),
          gazeY / (gazeX * sine + cosine),
        ],
        confidence: id % 5 === 0 ? 0.68 : 0.9,
        valid: true,
      })
      s.observeHand(handAt(id, time, x, y), time)
      if (s.getSnapshot().collection?.canLock) s.lockPoint()
    }
  }
  expect(s.getSnapshot().collection?.holds).toHaveLength(2)
  expect(s.getSnapshot().collection?.holds[1].target).toEqual([0.15, 0.15])
})
test("sustained weak pupil evidence discards the partial hold", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  for (let id = 1; id <= 30; id++) {
    const time = id * 50
    s.addEye({
      id,
      timestamp: time,
      feature: [0, 0],
      confidence: id <= 15 ? 0.9 : 0.68,
      valid: true,
    })
    s.observeHand(handAt(id, time), time)
    if (s.getSnapshot().collection?.canLock) s.lockPoint()
  }
  expect(s.getSnapshot().collection?.progress).toBe(0)
  expect(s.getSnapshot().collection?.holds).toHaveLength(0)
})
test("a rejected pupil frame reports the reason instead of an ambiguous waiting message", () => {
  const s = new SceneSession()
  s.startCapture("calibration")
  s.addEye({
    id: 1,
    timestamp: 50,
    feature: [0, 0],
    confidence: 0.68,
    valid: true,
  })
  s.observeHand(handAt(1, 50), 50)
  expect(s.getSnapshot().collection?.hint).toContain("68%")
  expect(s.getSnapshot().collection?.hint.toLowerCase()).toContain("pupil")
})
test("intervening pupil loss and sustained movement reset a hold before another hand arrives", () => {
  for (const interrupted of [null, [0.3, 0.3] as [number, number]]) {
    const s = new SceneSession()
    s.startCapture("calibration")
    for (let i = 1; i <= 15; i++) {
      s.addEye({
        id: i,
        timestamp: i * 50,
        feature: [0, 0],
        confidence: 0.9,
        valid: true,
      })
      s.observeHand(handAt(i, i * 50), i * 50)
      if (s.getSnapshot().collection?.canLock) s.lockPoint()
    }
    expect(s.getSnapshot().collection!.progress).toBeGreaterThan(0)
    for (let frame = 0; frame < (interrupted ? 5 : 1); frame++)
      s.addEye({
        id: 16 + frame,
        timestamp: 775 + frame * 50,
        feature: interrupted,
        confidence: interrupted ? 0.9 : 0,
        valid: !!interrupted,
      })
    expect(s.getSnapshot().collection!.progress).toBe(0)
    for (let i = 21; i <= 30; i++) {
      s.addEye({
        id: i,
        timestamp: 1000 + (i - 21) * 50,
        feature: [0, 0],
        confidence: 0.9,
        valid: true,
      })
      s.observeHand(handAt(i, 1000 + (i - 21) * 50), 1000 + (i - 21) * 50)
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
    for (let now = 50; now <= 37000; now += 50) {
      const cell = Math.min(13, Math.floor((now - 50) / 2600))
      const [x, y] = [...CALIBRATION_TARGETS, ...VALIDATION_TARGETS][cell]
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
      if (s.getSnapshot().collection?.canLock) s.lockPoint()
    }
    expect(s.getSnapshot().calibration).not.toBeNull()
    const m = s.getSnapshot().measurement!
    expect(m.valid).toBe(true)
    expect(m.eyeTimestamp! - m.sceneTimestamp!).toBe(-delay)
    expect(m.position![0]).toBeCloseTo(0.7, 6)
  }
})
